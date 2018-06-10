import {flatMap} from 'rxjs/operators';
import {Subject} from "rxjs";
import {Actor, ActorConstructor, ActorContext, ActorRef, Address, Message, Serializable} from "./types";


const emptyArr: any[] = [];
const CONCURRENT_MESSAGES = 1;

interface MessageSent {
    type: 'MessageSent';
    message: Message<any>;
}

interface ActorCreated {
    type: 'ActorCreated';
    address: Address;
}

// WIP, may not be a class
class ActorRefImpl<T> implements ActorRef<T> {
    constructor(private system: System, public address: Address) {
    }

    forward(message: Message<T>) {
        this.system.send(this.address, message, message.from);
    }

    tell(message: Message<T>, sender?: ActorRef<any>) {
        this.system.send(this.address, message, sender);
    }
}

function isActorRef(subj?: Address | ActorRef<any>): subj is ActorRef<any> {
    return Boolean(subj && (subj as any).address);
}

// TODO: actor end of life
// TODO: supervision
export class System {
    private actorRefs: { [a: string]: ActorRef<any> } = {};
    private localActors: { [a: string]: ActorInfo } = {};
    public readonly log = new Subject<MessageSent | ActorCreated>();

    protected sendMessage(message: Message<any>) {
        this.log.next({type: 'MessageSent', message});
        const localRecepient = this.localActors[message.to];
        if (localRecepient) {
            localRecepient.inbox.next(message);
        } else {
            console.error(new Error(`unknown address "${message.to}"`).stack);
        }
    }

    // send(to: Address, body: Serializable): void;
    // send(to: Address, body: Serializable, from: Address): void;
    // send(to: Address, body: Serializable, from: ActorRef<any>): void;
    send<T extends Serializable>(to: Address | ActorRef<T>, body: T, from?: Address | ActorRef<any>) {
        const toAddr = isActorRef(to) ? to.address : to;
        const fromAddr = isActorRef(from) ? from.address : from;
        this.sendMessage({to: toAddr, body, from: fromAddr});
    }

    actorOf(ctor: ActorConstructor<void>): Promise<ActorRef<any>>;
    actorOf<P, M>(ctor: ActorConstructor<P>, props: P): Promise<ActorRef<M>>;
    actorOf<P, M>(ctor: ActorConstructor<P>, props?: P): Promise<ActorRef<M>> {
        if (typeof ctor.address === 'string') {
            // yes, using var. less boilerplate.
            var address: string = ctor.address;
        } else if (typeof ctor.address === 'function') {
            address = (ctor.address as any)(props);
        } else {
            throw new Error(`actor constructor missing an address resolver`);
        }
        if (this.localActors[address]) {
            throw new Error(`an actor is already registered under ${address}`)
        }
        return this.startActor<P>(ctor, address, props).then(() =>  this.actorFor(address))
    }

    actorFor(addr: Address): ActorRef<any> {
        let result = this.actorRefs[addr];
        if (!result) {
            result = this.actorRefs[addr] = new ActorRefImpl(this, addr);
        }
        return result;
    }

    private async startActor<P>(ctor: ActorConstructor<P>, address: string, props?: P) {
        // wiring
        const system = this;
        const inbox = new Subject<Message<any>>();
        const context = {
            self : this.actorFor(address),
            system,
            send: <T1>(to: ActorRef<T1>, body: T1) => system.sendMessage({to : to.address, body, from: address})
        } as ActorContext<any>;
        // actor lifecycle
        const actor = new ctor(context, props!);
        this.localActors[address] = {inbox, actor};
        this.log.next({type: 'ActorCreated', address});
        if (actor.init) {
            await actor.init();
        }
        // TODO allow actor to add custom rxjs operators for its mailbox
        const actorHandleMessage = async (m: Message<any>) => {
            try {
                if ( typeof m.from === 'string'){
                    context.from = this.actorFor(m.from)
                }
                return await actor.onReceive(m) || emptyArr;
            } finally {
                context.from = undefined;
            }
        };
        inbox.pipe(flatMap(actorHandleMessage, CONCURRENT_MESSAGES)).subscribe();
    }
}

/**
 * all info about a single actor.
 * for message routing, debugging and reflection
 */
interface ActorInfo {
    inbox: Subject<Message<any>>;
    actor: Actor<any>;
}

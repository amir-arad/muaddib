import {flatMap} from 'rxjs/operators';
import {Subject} from "rxjs";
import {Actor, ActorConstructor, ActorContext, ActorRef, Address, Message, Serializable} from "./types";


const emptyArr: any[] = [];
const CONCURRENT_MESSAGES = 1;

interface MessageSent {
    type: 'MessageSent';
    message: Message<any>;
}

interface LogEvent {
    type: 'LogEvent';
    source: Address;
    message: any[];
}

interface UnhandledMessage {
    type: 'UnhandledMessage';
    source: Address;
    message: Message<any>;
    stack?: string;
}

interface ActorCreated {
    type: 'ActorCreated';
    address: Address;
}

type SystemLogEvents = MessageSent | ActorCreated | LogEvent | UnhandledMessage;

// WIP, may not be a class
class ActorRefImpl<T> implements ActorRef<T> {
    constructor(private system: System, public address: Address) {
    }

    // forward(message: Message<T>) {
    //     this.system.send(this.address, message, message.from);
    // }
    //
    // tell(message: Message<T>, sender?: ActorRef<any>) {
    //     this.system.send(this.address, message, sender);
    // }
}

interface InternalActorContext<T> extends ActorContext<T>{
    message:Message<T>;
}
// TODO: actor end of life
// TODO: supervision
export class System {
    private actorRefs: { [a: string]: ActorRef<any> } = {};
    private localActors: { [a: string]: ActorInfo } = {};
    public readonly log = new Subject<SystemLogEvents>();

    protected sendMessage(message: Message<any>) {
        this.log.next({type: 'MessageSent', message});
        const localRecepient = this.localActors[message.to];
        if (localRecepient) {
            localRecepient.inbox.next(message);
        } else {
            console.error(new Error(`unknown address "${message.to}"`).stack);
        }
    }

    send<T extends Serializable>(to: ActorRef<T>, body: T, replyTo?: ActorRef<any>) {
        this.sendMessage({to: to.address, body, replyTo: replyTo && replyTo.address});
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
        return this.startActor<P>(ctor, address, props).then(() => this.actorFor(address))
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
        // TODO: a class should be more efficient
        const context = {
            log: {
                log: (...args: any[]) => this.log.next({type: 'LogEvent', source: address, message: args})
            },
            unhandled: () => {
                this.log.next({
                    type: 'UnhandledMessage',
                    source: address,
                    message: context.message,
                    stack: new Error('unhandled message').stack
                })
            },
            self: this.actorFor(address),
            system,
            send: <T1>(to: ActorRef<T1>, body: T1, replyTo?:ActorRef<any>) => system.sendMessage({to: to.address, body, replyTo: replyTo && replyTo.address}),
            message: undefined as any
        } as InternalActorContext<any>;
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
                context.message = m;
                if (typeof m.replyTo === 'string') {
                    context.replyTo = this.actorFor(m.replyTo)
                }
                return await actor.onReceive(m.body) || emptyArr;
            } finally {
                context.message = undefined as any;
                context.replyTo = undefined;
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

import {flatMap} from 'rxjs/operators';
import {Subject} from "rxjs";
import {Actor, ActorConstructor, Address, Message, Serializable} from "./types";


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

// TODO: actor end of life
// TODO: supervision
export class System {
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

    send(to: Address, body: Serializable, from?: Address) {
        this.sendMessage({to, body, from});
    }

    actorOf(ctor: ActorConstructor<void>): Promise<void>;
    actorOf<P>(ctor: ActorConstructor<P>, props: P): Promise<void>;
    actorOf<P>(ctor: ActorConstructor<P>, props?: P): Promise<void> {
        if (typeof ctor.address === 'string') {
            // yes, using var. less boilerplate rubbish.
            var address: string = ctor.address;
        } else if (typeof ctor.address === 'function') {
            address = (ctor.address as any)(props);
        } else {
            throw new Error(`actor constructor missing an address resolver`);
        }
        if (this.localActors[address]) {
            throw new Error(`an actor is already registered under ${address}`)
        }
        return this.startActor<P>(ctor, address, props);
    }

    private async startActor<P>(ctor: ActorConstructor<P>, address: string, props?: P) {
        // wiring
        const system = this;
        const inbox = new Subject<Message<any>>();
        const context = {
            address, system,
            send: (to: Address, body: Serializable) => system.sendMessage({to, body, from: address})
        };
        // actor lifecycle
        const actor = new ctor(context, props!);
        this.localActors[address] = {inbox, actor};
        this.log.next({type: 'ActorCreated', address});
        if (actor.init) {
            await actor.init();
        }
        // TODO allow actor to add custom rxjs operators for its mailbox
        inbox.pipe(flatMap((m: Message<any>) => actor.onReceive(m) || emptyArr, CONCURRENT_MESSAGES)).subscribe();
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

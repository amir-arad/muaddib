import {flatMap} from 'rxjs/operators';
import {Subject} from "rxjs";
import {
    Actor,
    ActorContext,
    ActorDef,
    ActorRef,
    Address, isActorFactory,
    Message,
    MessageAndContext,
    Serializable
} from "./types";
import {Mailbox} from "./mailbox";

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

interface InternalActorContext<T> extends ActorContext<T> {
    message: Message<T>;
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

    actorOf<M>(ctor: ActorDef<void, M>): Promise<ActorRef<M>>;
    actorOf<P, M>(ctor: ActorDef<P>, props: P): Promise<ActorRef<M>>;
    actorOf<P, M>(ctor: ActorDef<P>, props?: P): Promise<ActorRef<M>> {
        if (typeof ctor.address === 'string') {
            // yes, using var. less boilerplate.
            var address: Address = ctor.address;
        } else if (typeof ctor.address === 'function') {
            address = (ctor.address as any)(props);
        } else {
            throw new Error(`actor constructor missing an address resolver`);
        }
        if (this.localActors[address]) {
            throw new Error(`an actor is already registered under ${address}`)
        }
        return this.startActor<P, M>(ctor, address, props!).then(() => this.actorFor(address))
    }

    actorFor(addr: Address): ActorRef<any> {
        let result = this.actorRefs[addr];
        if (!result) {
            result = this.actorRefs[addr] = new ActorRefImpl(this, addr);
        }
        return result;
    }

    unhandled(address: Address, message: Message<any>) {
        this.log.next({
            type: 'UnhandledMessage',
            source: address,
            message: message,
            stack: new Error('unhandled message').stack
        })
    };

    private async startActor<P, M>(ctor: ActorDef<P, M>, address: Address, props: P) {
        // wiring
        const system = this;
        const inbox = new Subject<Message<any>>();
        // TODO: a class should be more efficient
        const context: InternalActorContext<any> = {
            log: {
                log: (...args: any[]) => this.log.next({type: 'LogEvent', source: address, message: args})
            },
            unhandled: () => this.unhandled(address, context.message),
            self: this.actorFor(address),
            system,
            send: <T1>(to: ActorRef<T1>, body: T1, replyTo?: ActorRef<any>) =>
                system.sendMessage({to: to.address, body, replyTo: replyTo && replyTo.address}),
            unsafeAsk: async <T1>(to: ActorRef<T1>, reqBody: T1, id?: string): Promise<MessageAndContext<any>> => {
                // the actor may be handling a different message when this one returns
                // TODO: kill, add timeout
                const mailbox = new Mailbox(system, id);
                const body = await mailbox.ask(to, reqBody);
                return {
                    // TODO replyTo
                    unhandled: () => this.unhandled(address, {to: to.address, body}),
                    body
                };
            },
            message: undefined as any
        };
        // actor lifecycle
        const actor = await this.makeActor<P, M>(ctor, context, props);
        this.localActors[address] = {inbox, actor};
        this.log.next({type: 'ActorCreated', address});
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

    private makeActor<P, M>(ctor: ActorDef<P, M>, context: InternalActorContext<M>, props: P): Actor<M> | Promise<Actor<M>> {
        return isActorFactory(ctor) ? ctor.create(context, props!) : new ctor(context, props!);
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

import {flatMap} from 'rxjs/operators';
import {Subject} from "rxjs";
import {
    Actor,
    ActorContext,
    ActorDef,
    ActorFunction,
    ActorRef,
    Address,
    isActorFactory,
    Message,
    MessageAndContext,
    Serializable
} from "./types";

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
    __message: Message<T>;
}

/**
 * create a no-operation function actor for given actor context
 */
export function nullActor<T>(ctx: ActorContext<T>): ActorFunction<T> {
    return ctx.unhandled.bind(ctx)
}

// TODO: actor end of life
// TODO: supervision
export class System {
    private actorRefs: { [a: string]: ActorRef<any> } = {};
    private localActors: { [a: string]: ActorInfo } = {};
    private jobCounter = 0;

    public readonly log = new Subject<SystemLogEvents>();

    async run(script: (ctx: ActorContext<never>) => any, address: Address = '' + this.jobCounter++): Promise<void> {
        await this.actorOf({
            address: 'run:' + address,
            create: async ctx => {
                await script(ctx);
                return nullActor(ctx); // TODO: kill
            }
        });
    }

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
        let jobCounter = 0;
        // TODO: a class should be more efficient
        const context: InternalActorContext<any> = {
            log: {
                log: (...args: any[]) => this.log.next({type: 'LogEvent', source: address, message: args})
            },
            unhandled: () => this.unhandled(address, context.__message),
            self: this.actorFor(address),
            system,
            send: <T1>(to: ActorRef<T1>, body: T1, replyTo?: ActorRef<any>) =>
                system.sendMessage({to: to.address, body, replyTo: replyTo && replyTo.address}),
            ask: async <T1>(to: ActorRef<T1>, reqBody: T1, options?: { id?: string, timeout?: number }): Promise<MessageAndContext<any>> => {
                // the actor may be handling a different message when this one returns
                // TODO: kill?
                return new Promise<MessageAndContext<any>>(async (resolve, reject) => {
                    // time out the entire operation
                    setTimeout(() => reject(new Error('request timed out')), options && options.timeout || 1000);
                    // make an actor that will receive the reply
                    const replyAddress = address + '/asking:' + (options && options.id || jobCounter++);
                    const replyActorRef = await this.actorOf({
                        address: replyAddress,
                        create: (ctx: InternalActorContext<any>) => (body: M) => {
                            resolve({
                                replyTo: ctx.replyTo,
                                unhandled: () => this.unhandled(replyAddress, ctx.__message),
                                body
                            });
                        }
                    });
                    // send the request with custom replyTo
                    this.send(to, reqBody, replyActorRef);
                });
            },
            __message: undefined as any
        };
        // TODO allow actor to add custom rxjs operators for its mailbox
        const actorHandleMessage = async (m: Message<any>) => {
            try {
                context.__message = m;
                if (typeof m.replyTo === 'string') {
                    context.replyTo = this.actorFor(m.replyTo);
                }
                const actorResult = typeof actor === 'function' ? actor(m.body) : actor.onReceive(m.body);
                return await actorResult || emptyArr;
            } finally {
                context.__message = undefined as any;
                context.replyTo = undefined;
            }
        };
        inbox.pipe(flatMap(actorHandleMessage, CONCURRENT_MESSAGES)).subscribe();

        // actor lifecycle
        const actor = await (isActorFactory(ctor) ? ctor.create(context, props!) : new ctor(context, props!));
        this.localActors[address] = {inbox, actor};
        this.log.next({type: 'ActorCreated', address});
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

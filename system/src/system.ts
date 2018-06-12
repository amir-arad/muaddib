import {flatMap} from 'rxjs/operators';
import {from, Subject} from "rxjs";
import {
    Actor,
    ActorContext,
    ActorDef,
    ActorFunction,
    ActorRef,
    Address,
    ChildActorRef,
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

interface UndeliveredMessage {
    type: 'UndeliveredMessage';
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

interface ActorDestroyed {
    type: 'ActorDestroyed';
    address: Address;
}

type SystemLogEvents = MessageSent | UndeliveredMessage | UnhandledMessage | ActorCreated | ActorDestroyed | LogEvent;

// WIP, may not be a class
class ActorRefImpl<T> implements ChildActorRef<T> {
    constructor(private system: System, public address: Address) {
    }

    stop(): void {
        (this.system as any).stopActor(this.address);
    }
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

// TODO: supervision
export class System {
    private actorRefs: { [a: string]: ActorRef<any> } = {};
    private localActors: { [a: string]: ActorManager<any, any> } = {};
    private jobCounter = 0;

    public readonly log = new Subject<SystemLogEvents>();

    stopActor(address: Address) {
        const actorMgr = this.localActors[address];
        if (actorMgr) {
            this.log.next({type: 'ActorDestroyed', address});
            actorMgr.stop();
            delete this.localActors[address];
        }
    }

    async run(script: (ctx: ActorContext<never>) => any, address: Address = '' + this.jobCounter++): Promise<void> {
        const ref = await this.actorOf({
            address: 'run:' + address,
            create: async ctx => {
                await script(ctx);
                return nullActor(ctx);
            }
        });
        ref.stop();
    }

    sendMessage(message: Message<any>) {
        this.log.next({type: 'MessageSent', message});
        const localRecepient = this.localActors[message.to];
        if (localRecepient) {
            localRecepient.sendMessage(message);
        } else {
            this.log.next({type: 'UndeliveredMessage', message});
            console.error(new Error(`unknown address "${message.to}"`).stack);
        }
    }

    send<T extends Serializable>(to: ActorRef<T>, body: T, replyTo?: ActorRef<any>) {
        this.sendMessage({to: to.address, body, replyTo: replyTo && replyTo.address});
    }

    actorOf<M>(ctor: ActorDef<void, M>): ChildActorRef<M>;
    actorOf<P, M>(ctor: ActorDef<P, M>, props: P): ChildActorRef<M>;
    actorOf<P, M>(ctor: ActorDef<P, M>, props?: P): ChildActorRef<M> {
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
        this.localActors[address] = new ActorManager<P, M>(ctor, address, props as P, this);
        this.log.next({type: 'ActorCreated', address});
        return this.actorFor(address) as ChildActorRef<M>;
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
}

function isPromiseLike(subj: any): subj is PromiseLike<any> {
    return Boolean(subj && typeof subj.then === 'function');
}

class ActorManager<P, M> {
    private readonly inbox = new Subject<Message<M>>();
    private readonly context: InternalActorContext<M>;
    private jobCounter = 0;

    //constructor(private actor: Actor<M>, private context: InternalActorContext<any>, private system: System) {
    constructor(private ctor: ActorDef<P, M>, private address: Address, private props: P, private system: System) {
        // TODO: a class should be more efficient
        this.context = {
            log: {
                log: (...args: any[]) => system.log.next({type: 'LogEvent', source: address, message: args})
            },
            unhandled: () => system.unhandled(address, this.context.__message),
            self: system.actorFor(address),
            system,
            send: <T1>(to: ActorRef<T1>, body: T1, replyTo?: ActorRef<any>) =>
                system.sendMessage({to: to.address, body, replyTo: replyTo && replyTo.address}),
            ask: async <T1>(to: ActorRef<T1>, reqBody: T1, options?: { id?: string, timeout?: number }): Promise<MessageAndContext<any>> => {
                // the actor may be handling a different message when this one returns
                return new Promise<MessageAndContext<any>>(async (resolve, reject) => {
                    // time out the entire operation
                    const timeout = setTimeout(() => {
                        replyActorRef.stop();
                        reject(new Error('request timed out : ' + JSON.stringify(reqBody)));
                    }, options && options.timeout || 1000);
                    // make an actor that will receive the reply
                    const replyAddress = address + '/asking:' + (options && options.id || this.jobCounter++);
                    const replyActorRef = await system.actorOf({
                        address: replyAddress,
                        create: (askContext: InternalActorContext<any>) => (body: M) => {
                            resolve({
                                replyTo: askContext.replyTo,
                                unhandled: () => system.unhandled(replyAddress, askContext.__message),
                                body
                            });
                            clearTimeout(timeout);
                            replyActorRef.stop();
                        }
                    });
                    // send the request with custom replyTo
                    system.send(to, reqBody, replyActorRef);
                });
            },
            stop: () => system.stopActor(address),
            __message: undefined as any
        };

        const actor = (isActorFactory(ctor) ? ctor.create(this.context, props!) : new ctor(this.context, props!));
        if (isPromiseLike(actor)) {
            const meanwhile: Array<Message<M>> = [];
            const meanwhileSubscription = this.inbox.subscribe(m => {
                meanwhile.push(m);
            });
            actor.then(a => {
                this.initActor(a);
                meanwhileSubscription.unsubscribe();
                from(meanwhile).subscribe(m => this.inbox.next(m));
            });
        } else {
            this.initActor(actor);
        }
    }

    initActor(actor: Actor<M>) {
        // TODO allow actor to add custom rxjs operators for its mailbox
        const actorHandleMessage = async (m: Message<M>) => {
            try {
                this.context.__message = m;
                if (typeof m.replyTo === 'string') {
                    this.context.replyTo = this.system.actorFor(m.replyTo);
                }
                const actorResult = typeof actor === 'function' ? actor(m.body) : actor.onReceive(m.body);
                return await actorResult || emptyArr;
            } finally {
                this.context.__message = undefined as any;
                this.context.replyTo = undefined;
            }
        };
        this.inbox.pipe(flatMap(actorHandleMessage, CONCURRENT_MESSAGES)).subscribe();
        // TODO : startup hook on actor object
    }

    sendMessage(message: Message<M>) {
        this.inbox.next(message);
    }

    stop() {
        // TODO : shutdown hook on actor object
        this.inbox.complete();
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

import {Subject} from "rxjs";
import {
    ActorContext,
    ActorDef,
    ActorFunction,
    ActorRef,
    ActorSystem,
    Address,
    ChildActorRef,
    Message,
    Serializable,
    SystemLogEvents
} from "./types";
import {ActorManager} from "./actor-manager";

class ActorRefImpl<T> implements ChildActorRef<T> {
    constructor(private system: ActorSystem, public address: Address) {
    }

    stop(): void {
        (this.system as any).stopActor(this.address);
    }
}

/**
 * create a no-operation function actor for given actor context
 */
export function nullActor<T>(ctx: ActorContext<T>): ActorFunction<T> {
    return ctx.unhandled.bind(ctx)
}

export function createActorSystem(): ActorSystem {
    return new ActorSystemImpl();
}

// TODO: supervision
export class ActorSystemImpl implements ActorSystem {
    private actorRefs: { [a: string]: ChildActorRef<any> } = {};
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

    run(script: (ctx: ActorContext<never>) => any, address: Address = '' + this.jobCounter++): Promise<void> {
        return new Promise(res => {
            const ref = this.createActor({
                address: 'run:' + address,
                create: async ctx => {
                    await script(ctx);
                    ref.stop();
                    res(); // TODO: move to shutdown hook
                    return nullActor(ctx);
                }
            }, undefined);
        });
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

    createActor<P, M>(ctor: ActorDef<P, M>, props: P): ChildActorRef<M> {
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
        this.localActors[address] = new ActorManager<P, M>(ctor, address, props, this);
        this.log.next({type: 'ActorCreated', address});
        return this.getActorRef(address);
    }

    getActorRef(addr: Address) {
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

import {Subject} from "rxjs";
import {
    ActorContext,
    ActorDef,
    ActorFunction,
    ActorSystem,
    Address,
    Message,
    SystemLogEvents
} from "./types";
import {ActorManager} from "./actor-manager";
import {ActorContextImpl} from "./actor-context";

export class BaseActorRef<T> {
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

// definition of some root actor to serve as root-level binding resolution context
const rootActorDefinition: ActorDef<any, any> = {
    address: 'root',
    create: nullActor
};

// TODO: supervision
export class ActorSystemImpl implements ActorSystem {
    private actorRefs: { [a: string]: BaseActorRef<any> } = {}; // TODO: weakmap
    private localActors: { [a: string]: ActorManager<any, any> } = {};
    private rootContext = new ActorContextImpl(this, rootActorDefinition, 'root');
    private jobCounter = 0;

    public readonly log = new Subject<SystemLogEvents>();

    bindValue(key: string, ctx: ActorDef<any, any>, value: any): void {
        this.rootContext.bindValue(key, ctx, value);
    }

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
            this.createActor({
                address: 'run:' + address,
                create: async ctx => {
                    await script(ctx);
                    ctx.stop();
                    res(); // TODO: move to shutdown hook
                    return nullActor(ctx);
                }
            }, undefined, this.rootContext);
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

    createActor<P, M>(ctor: ActorDef<P, M>, props: P, context: ActorContextImpl<any>) {
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
        const newContext = new ActorContextImpl<M>(this, ctor, address, context);
        this.localActors[address] = new ActorManager<P, M>(newContext, ctor, address, props);
        this.log.next({type: 'ActorCreated', address});
        return address;
    }

    getBaseActorRef(addr: Address) {
        let result = this.actorRefs[addr];
        if (!result) {
            result = this.actorRefs[addr] = new BaseActorRef(this, addr);
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

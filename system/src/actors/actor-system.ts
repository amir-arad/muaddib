import {Subject} from "rxjs";
import {ActorContext, ActorDef, ActorFunction, ActorSystem, Address, Message, SystemLogEvents} from "./types";
import {ActorManager} from "./actor-manager";
import {ActorContextImpl} from "./actor-context";
import {Container} from "../dependencies/dependencies";

// TODO: remove
export class BaseActorRef {
    constructor(private system: ActorSystem<any>, public address: Address) {
    }

    stop(): void {
        (this.system as any).stopActor(this.address);
    }
}

/**
 * create a no-operation function actor for given actor context
 */
export function nullActor<T>(ctx: ActorContext<T, any>): ActorFunction<T> {
    return ctx.unhandled.bind(ctx)
}


// definition of some root actor to serve as root-level binding resolution context
const rootActorDefinition: ActorDef<any, any, any> = {
    address: 'root',
    create: nullActor
};

// TODO: supervision
export class ActorSystemImpl<D> implements ActorSystem<D> {

    private actorRefs: { [a: string]: BaseActorRef } = {}; // TODO: remove
    private localActors: { [a: string]: ActorManager<any, any> } = {};
    private readonly rootContext: ActorContextImpl<never, D>;
    public readonly run: ActorContextImpl<never, D>['run'];
    public readonly log = new Subject<SystemLogEvents>();

    constructor(public container: Container<D>) {
        this.rootContext = new ActorContextImpl<never, D>(this, rootActorDefinition, 'root', this.container);
        this.run = this.rootContext.run.bind(this.rootContext);
    }

    stopActor(address: Address) {
        const actorMgr = this.localActors[address];
        if (actorMgr) {
            this.log.next({type: 'ActorDestroyed', address});
            actorMgr.stop();
            delete this.localActors[address];
        }
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

    private makeNewAddress<P>(ctor: ActorDef<P, any, any>, props: P) {
        let newAddress : Address;
        if (typeof ctor.address === 'string') {
            newAddress = ctor.address;
        } else if (typeof ctor.address === 'function') {
            newAddress = (ctor.address as any)(props);
        } else {
            throw new Error(`actor constructor missing an address resolver`);
        }
        if (this.localActors[newAddress]) {
            throw new Error(`an actor is already registered under ${newAddress}`)
        }
        return newAddress;
    }

    createActor<P, M>(ctor: ActorDef<P, M, D>, props: P, context: ActorContextImpl<any, D>) {
        const newAddress = this.makeNewAddress(ctor, props);
        const newContainer = new Container(context.container.resolve);
        const newContext = new ActorContextImpl<M, D>(this, ctor, newAddress, newContainer);
        this.localActors[newAddress] = new ActorManager<P, M>(newContext, ctor, newAddress, props);
        this.log.next({type: 'ActorCreated', address: newAddress});
        return newAddress;
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

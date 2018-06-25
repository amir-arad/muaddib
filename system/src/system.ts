import {Subject} from "rxjs";
import {ActorContext, ActorDef, ActorFunction, Address, ClusterNode, Message, System, SystemLogEvents} from "./types";
import {ActorManager} from "./actor/manager";
import {ActorContextImpl} from "./actor/context";
import {AnyProvisioning, BindContext, ProvisioningPath, ResolveContext} from "./dependencies";
import {Postal, SystemClusterNode} from "./cluster";

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

// TODO : supervision
export class SystemImpl<D> implements System<D> {
    public localActors: { [a: string]: ActorManager<any, any> } = {};
    private readonly rootContext: ActorContextImpl<never, D>;
    public readonly run: ActorContextImpl<never, D>['run'];
    public readonly log = new Subject<SystemLogEvents>();
    public readonly cluster: ClusterNode & Postal = new SystemClusterNode(this);

    constructor(public id: string, private container: ResolveContext<D> & BindContext<D>) {
        this.rootContext = new ActorContextImpl<never, D>(this, rootActorDefinition, 'root', this.container.get);
        this.run = this.rootContext.run.bind(this.rootContext);
    }

    set<P extends keyof D>(provisioning: ProvisioningPath<P> & AnyProvisioning<D[P]>): void {
        this.log.next({type: 'ProvisioningSet', key: provisioning.key.toString()});
        return this.container.set(provisioning as any);
    }

    createActor<P, M>(ctor: ActorDef<P, M, D>, props: P) {
        const newAddress = this.makeNewAddress(ctor, props);
        const newContext = new ActorContextImpl<M, D>(this, ctor, newAddress, this.container.get);
        this.localActors[newAddress] = new ActorManager<P, M>(newContext, ctor, newAddress, props);
        this.cluster.addAddress(newAddress);
        this.log.next({type: 'ActorCreated', address: newAddress});
        return newAddress;
    }

    stopActor(address: Address) {
        const actorMgr = this.localActors[address];
        if (actorMgr) {
            this.log.next({type: 'ActorDestroyed', address});
            actorMgr.stop();
            this.cluster.removeAddress(address);
            delete this.localActors[address];
        }
    }

    sendLocalMessage(message: Message<any>) {
        // if the message is for a local actor, send it directly
        const localRecepient = this.localActors[message.to];
        if (localRecepient) {
            localRecepient.sendMessage(message);
        } else {
            this.log.next({type: 'UndeliveredMessage', message});
            console.error(new Error(`unknown local address "${message.to}"`).stack);
        }
    }

    sendMessage(message: Message<any>) {
        this.log.next({type: 'MessageSent', message});
        // look for another system to send the message to
        if (!this.cluster.sendMessage(message)) {
            this.log.next({type: 'UndeliveredMessage', message});
            console.error(new Error(`unknown global address "${message.to}"`).stack);
        }
    }

    private makeNewAddress<P>(ctor: ActorDef<P, any, any>, props: P) {
        let newAddress: Address;
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

    unhandled(source: Address, message: Message<any>) {
        this.log.next({
            type: 'UnhandledMessage',
            source, message,
            stack: new Error('unhandled message').stack
        })
    };
}

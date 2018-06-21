import {Subject} from "rxjs";
import {
    ActorContext,
    ActorDef,
    ActorFunction,
    ActorSystem,
    Address,
    Message,
    SystemLogEvents,
    SystemNetworkApi
} from "./types";
import {ActorManager} from "./actor-manager";
import {ActorContextImpl} from "./actor-context";
import {AnyProvisioning, BindContext, ProvisioningPath, ResolveContext} from "../dependencies/types";
import {Container} from "../dependencies/dependencies";

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


/**
 * this actor should receive all messages that shouyld be sent to the remote system, and forward them
 */
class RemoteSystemImpl implements SystemNetworkApi {

    constructor(private system: ActorSystemImpl<any>) {
    }

    name = (): Promise<string> => {
        return Promise.resolve(this.system.name);
    };

    getAllAddresses = (): Promise<Array<Address>> => {
        return Promise.resolve(Object.keys(this.system.localActors));
    };

    sendMessage = (message: Message<any>): void => {
        this.system.sendMessage(message);
    };

    onAddAddress = (otherSystemName: string, address: Address): void => {
        this.system.remoteAddresses.addRemoteAddress(otherSystemName, address);
    };

    onRemoveAddress = (otherSystemName: string, address: Address): void => {
        this.system.remoteAddresses.removeRemoteAddress(otherSystemName, address);
    };
}

interface AddressBookEntry {
    systemName: string;
    system: SystemNetworkApi;
    address: Address;
}

class AddressBook {
    public entries: AddressBookEntry[] = [];
    public systems: { [systemName: string]: SystemNetworkApi } = {};

    constructor(private localSyatemName: string) {}

    addRemoteSystem(systemName: string, remoteSystem: SystemNetworkApi) {
        this.systems[systemName] = remoteSystem;
    }

    addRemoteAddress(systemName: string, address: Address) {
        this.entries.push({systemName, system: this.systems[systemName], address});
    }

    removeRemoteAddress(systemName: string, address: Address) {
        this.entries = this.entries.filter(e => e.address === address && e.systemName === systemName);
    }

    getRemoteSystemByAddress(address: Address) {
        // todo: sort by distance
        const entry = this.entries.find(e => e.address === address);
        return entry && entry.system;
    }

    addLocalAddress(address: Address): void {
        Object.keys(this.systems).forEach(sn => this.systems[sn].onAddAddress(this.localSyatemName, address))
    }

    removeLocalAddress(address: Address): void {
        Object.keys(this.systems).forEach(sn => this.systems[sn].onRemoveAddress(this.localSyatemName, address))
    }
}

// TODO : supervision
export class ActorSystemImpl<D> implements ActorSystem<D> {
    public localActors: { [a: string]: ActorManager<any, any> } = {};
    public remoteAddresses: AddressBook;
    private readonly rootContext: ActorContextImpl<never, D>;
    public readonly run: ActorContextImpl<never, D>['run'];
    public readonly log = new Subject<SystemLogEvents>();
    private boundGet: Container<D>['get'];
    public readonly remoteApi: RemoteSystemImpl;

    constructor(public name: string, private container: ResolveContext<D> & BindContext<D>) {
        this.boundGet = container.get.bind(container);
        this.rootContext = new ActorContextImpl<never, D>(this, rootActorDefinition, 'root', this.boundGet);
        this.run = this.rootContext.run.bind(this.rootContext);
        this.remoteApi = new RemoteSystemImpl(this);
        this.remoteAddresses = new AddressBook(this.name);
    }

    async connectTo(remoteSystem: SystemNetworkApi) {
        const name = await remoteSystem.name();
        this.remoteAddresses.addRemoteSystem(name, remoteSystem);
        const allAddresses = await remoteSystem.getAllAddresses();
        allAddresses.forEach(a => this.remoteAddresses.addRemoteAddress(name, a));
    }

    set<P extends keyof D>(provisioning: ProvisioningPath<P> & AnyProvisioning<D[P]>): void {
        this.log.next({type: 'ProvisioningSet', key: provisioning.key.toString()});
        return this.container.set(provisioning as any);
    }

    createActor<P, M>(ctor: ActorDef<P, M, D>, props: P) {
        const newAddress = this.makeNewAddress(ctor, props);
        const newContext = new ActorContextImpl<M, D>(this, ctor, newAddress, this.boundGet);
        this.localActors[newAddress] = new ActorManager<P, M>(newContext, ctor, newAddress, props);
        this.remoteAddresses.addLocalAddress(newAddress);
        this.log.next({type: 'ActorCreated', address: newAddress});
        return newAddress;
    }

    stopActor(address: Address) {
        const actorMgr = this.localActors[address];
        if (actorMgr) {
            this.log.next({type: 'ActorDestroyed', address});
            actorMgr.stop();
            this.remoteAddresses.removeLocalAddress(address);
            delete this.localActors[address];
        }
    }

    sendMessage(message: Message<any>) {
        this.log.next({type: 'MessageSent', message});
        const localRecepient = this.localActors[message.to];
        if (localRecepient) {
            localRecepient.sendMessage(message);
        } else {
            const otherSystem = this.remoteAddresses.getRemoteSystemByAddress(message.to);
            if (otherSystem) {
                otherSystem.sendMessage(message);
            } else {
                this.log.next({type: 'UndeliveredMessage', message});
                console.error(new Error(`unknown address "${message.to}"`).stack);
            }
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

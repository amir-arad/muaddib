import {Address, Message, SystemLinkEdge} from "./types";
import {Observable, Subject} from 'rxjs';

export interface SystemInternal {
    name: string;

    sendMessage(message: Message<any>): void;
}

export interface Handshake {
    type: 'Handshake';
//    targets : ['name', 'getAllAddresses', 'onAddAddress', 'onRemoveAddress', 'sendMessage']
    name: string;
    addresses: string[];
}

export interface HandshakeConfirm {
    type: 'HandshakeConfirm';
    //    targets : ['name', 'getAllAddresses', 'onAddAddress', 'onRemoveAddress', 'sendMessage']
    name: string;
    addresses: string[];
}

export interface AddAddress {
    type: 'AddAddress';
    address: Address;
}

export interface RemoveAddress {
    type: 'RemoveAddress';
    address: Address;
}

export interface SendMessage {
    type: 'SendMessage';
    message: Message<any>;
}

export type MessageTypeMap = {
    AddAddress: AddAddress;
    RemoveAddress: RemoveAddress;
    SendMessage: SendMessage;
    Handshake: Handshake;
    HandshakeConfirm: HandshakeConfirm
}
export type LinkMessage = MessageTypeMap[keyof MessageTypeMap];

export function isMessageType<T extends keyof MessageTypeMap>(t: T, m: LinkMessage): m is MessageTypeMap[T] {
    return m.type === t;
}

export interface LocalEdge {
    connectTo(remoteSystem: SystemLinkEdge): void;

    getName(): Promise<string>;

    getAllAddresses(): Promise<Array<Address>>;
}

export interface Medium {
    input: Subject<LinkMessage>;
    output: Observable<LinkMessage>;
}
// TODO check with https://github.com/harunurhan/rx-socket.io-client ?
export async function connect(channel : Medium, localEdge: SystemLinkEdge & LocalEdge): Promise<void> {
    const resolvement = new Promise<Handshake | HandshakeConfirm>(async (resolve) => {
        const subscription = channel.output.subscribe(async (msg: LinkMessage) => {
            // console.log(msg);
            if (isMessageType('Handshake', msg)) {
                channel.input.next({
                    type: 'HandshakeConfirm',
                    name: await localEdge.getName(),
                    addresses: await localEdge.getAllAddresses()
                });
                subscription.unsubscribe();
                resolve(msg);
            } else if (isMessageType('HandshakeConfirm', msg)) {
                subscription.unsubscribe();
                resolve(msg);
            }
        });
    });
    await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 45));
    channel.input.next({
        type: 'Handshake',
        name: await localEdge.getName(),
        addresses: await localEdge.getAllAddresses()
    });
    const msg = await resolvement;
    channel.output.subscribe(async (m: LinkMessage) => {
        if (isMessageType('AddAddress', m)) {
            localEdge.onAddAddress(msg.name, m.address);
        } else if (isMessageType('RemoveAddress', m)) {
            localEdge.onRemoveAddress(msg.name, m.address);
        } else if (isMessageType('SendMessage', m)) {
            localEdge.sendMessage(m.message);
        }
    });
    // todo: refactor out once simple-link is out
    const remoteSystem: SystemLinkEdge = {
        // TODO remove
        getName(): Promise<string> {
            return Promise.resolve(msg.name);
        },
        // TODO remove
        getAllAddresses(): Promise<Array<Address>> {
            return Promise.resolve(msg.addresses);
        },
        onAddAddress(otherSystemName: string, address: Address): void {
            channel.input.next({type: 'AddAddress', address})
        },
        onRemoveAddress(otherSystemName: string, address: Address): void {
            channel.input.next({type: 'RemoveAddress', address})
        },
        sendMessage(message: Message<any>): void {
            channel.input.next({type: 'SendMessage', message})
        }
    };
    return localEdge.connectTo(remoteSystem);
}

export class SystemLinksManager implements SystemLinkEdge, LocalEdge {
    public input = new Subject<LinkMessage>();

    private addressBook: AddressBook;

    constructor(private system: SystemInternal) {
        this.addressBook = new AddressBook(system.name);
    }

// new connect API
    get name(): string {
        return this.system.name;
    }

    get addresses(): string[] {
        return this.addressBook.getAllAddresses();
    }

// old connect api
    async connectTo(remoteSystem: SystemLinkEdge) {
        const name = await remoteSystem.getName();
        this.addressBook.addRemoteSystem(name, remoteSystem);
        const allAddresses = await remoteSystem.getAllAddresses();
        allAddresses.forEach(a => this.onAddAddress(name, a));
    }

    // TODO: change to property that is transfered with the object
    getName = (): Promise<string> => {
        return Promise.resolve(this.system.name);
    };

    // TODO: change to property that is transfered with the object
    getAllAddresses = (): Promise<Array<Address>> => {
        return Promise.resolve(this.addressBook.getAllAddresses());
    };

    sendMessage = (message: Message<any>): void => {
        this.system.sendMessage(message);
    };

    onAddAddress = (otherSystemName: string, address: Address): void => {
        this.addressBook.addAddress(otherSystemName, address);
    };

    onRemoveAddress = (otherSystemName: string, address: Address): void => {
        this.addressBook.removeAddress(otherSystemName, address);
    };

    getEdgeByAddress(address: Address): SystemLinkEdge | undefined {
        return this.addressBook.getEdgeByAddress(address);
    }
}

interface AddressBookEntry {
    edgeName: string;
    edge: SystemLinkEdge;
    address: Address;
}

/**
 * manage all addresses known to a system
 */
class AddressBook {
    private entries: AddressBookEntry[] = [];
    private otherEdges: { [systemName: string]: SystemLinkEdge } = {};

    constructor(private localName: string) {
    }

    getAllAddresses() {
        return Array.from(new Set(this.entries.map(e => e.address)))
    }

    addAddress(systemName: string, address: Address) {
        this.entries.push({edgeName: systemName, edge: this.otherEdges[systemName], address});
        Object.keys(this.otherEdges)
            .forEach(sn => {
                sn !== systemName && this.otherEdges[sn].onAddAddress(this.localName, address);
            })
    }

    removeAddress(systemName: string, address: Address) {
        this.entries = this.entries.filter(e => e.address === address && e.edgeName === systemName);
        Object.keys(this.otherEdges)
            .forEach(sn => {
                sn !== systemName && this.otherEdges[sn].onRemoveAddress(this.localName, address)
            });
    }

    addRemoteSystem(systemName: string, remoteSystem: SystemLinkEdge) {
        this.otherEdges[systemName] = remoteSystem;
    }

    getEdgeByAddress(address: Address) {
        // todo: sort by distance
        const entry = this.entries.find(e => e.address === address);
        return entry && entry.edge;
    }
}

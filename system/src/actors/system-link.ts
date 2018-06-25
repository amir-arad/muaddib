import {Address, Message} from "./types";
import {Observable, Subject} from 'rxjs';


export interface Handshake {
    type: 'Handshake';
    name: string;
    addresses: string[];
}

export interface HandshakeConfirm {
    type: 'HandshakeConfirm';
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

export interface LocalSystem {
    name: string;

    sendLocalMessage(message: Message<any>): void;
}

export interface LocalEdge {
    connectTo(name: string, addresses: string[], input: Subject<LinkMessage>): void;

    getName(): Promise<string>;

    getAllAddresses(): Promise<Array<Address>>;
}

export interface Medium {
    input: Subject<LinkMessage>;
    output: Observable<LinkMessage>;
}

export interface SystemLinkEdge {

    getName(): Promise<string>;

    getAllAddresses(): Promise<Array<Address>>;

    onAddAddress(otherSystemName: string, address: Address): void;

    onRemoveAddress(otherSystemName: string, address: Address): void;

    sendMessage(message: Message<any>): void;
}

export interface SystemLinkLocalEdge extends SystemLinkEdge {
    connectTo(name: string, addresses: string[], input: Subject<LinkMessage>): void;
}

// TODO check with https://github.com/harunurhan/rx-socket.io-client ?
export async function connect(channel: Medium, localEdge: SystemLinkEdge & LocalEdge): Promise<void> {
    const resolution = new Promise<Handshake | HandshakeConfirm>(async (resolve) => {
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
    const msg = await resolution;
    channel.output.subscribe(async (m: LinkMessage) => {
        if (isMessageType('AddAddress', m)) {
            localEdge.onAddAddress(msg.name, m.address);
        } else if (isMessageType('RemoveAddress', m)) {
            localEdge.onRemoveAddress(msg.name, m.address);
        } else if (isMessageType('SendMessage', m)) {
            localEdge.sendMessage(m.message);
        }
    });

    return localEdge.connectTo(msg.name, msg.addresses, channel.input);
}

export class SystemLinksManager implements SystemLinkEdge, LocalEdge {
    public input = new Subject<LinkMessage>();

    private addressBook: AddressBook;

    constructor(private system: LocalSystem) {
        this.addressBook = new AddressBook(system.name);
        this.addressBook.addRemoteSystem(system.name, this.input);
        this.input.subscribe(async (m: LinkMessage) => {
            if (isMessageType('AddAddress', m)) {
                this.onAddAddress(system.name, m.address);
            } else if (isMessageType('RemoveAddress', m)) {
                this.onRemoveAddress(system.name, m.address);
            } else if (isMessageType('SendMessage', m)) {
                this.system.sendLocalMessage(m.message);
            }
        })
    }

    get name(): string {
        return this.system.name;
    }

    get addresses(): string[] {
        return this.addressBook.getAllAddresses();
    }

    connectTo(name: string, addresses: string[], input: Subject<LinkMessage>): void {
        this.addressBook.addRemoteSystem(name, input);
        addresses.forEach(a => this.onAddAddress(name, a));
    }

    // TODO: change to property that is transfered with the object
    getName = (): Promise<string> => {
        return Promise.resolve(this.system.name);
    };

    // TODO: change to property that is transfered with the object
    getAllAddresses = (): Promise<Array<Address>> => {
        return Promise.resolve(this.addressBook.getAllAddresses());
    };

    sendMessage = (message: Message<any>): boolean => {
        // look for another system to send the message to
        const otherSystem = this.getEdgeByAddress(message.to);
        if (otherSystem) {
            otherSystem.next({type: 'SendMessage', message});
            return true;
        } else {
            return false;
        }
    };

    onAddAddress = (otherSystemName: string, address: Address): void => {
        this.addressBook.addAddress(otherSystemName, address);
    };

    onRemoveAddress = (otherSystemName: string, address: Address): void => {
        this.addressBook.removeAddress(otherSystemName, address);
    };

    getEdgeByAddress(address: Address): Subject<LinkMessage> | undefined {
        return this.addressBook.getEdgeByAddress(address);
    }
}

interface AddressBookEntry {
    edgeName: string;
    edge: Subject<LinkMessage>;
    address: Address;
}
/**
 * manage all addresses known to a system
 */
class AddressBook {
    private entries: AddressBookEntry[] = [];
    private otherEdges: { [systemName: string]: Subject<LinkMessage> } = {};

    constructor(private localName: string) {
    }

    getAllAddresses() {
        return Array.from(new Set(this.entries.map(e => e.address)))
    }

    addAddress(reportingSystemName: string, address: Address) {
        this.entries.push({edgeName: reportingSystemName, edge: this.otherEdges[reportingSystemName], address});
        Object.keys(this.otherEdges).forEach(reportTo => {
            if (reportTo !== reportingSystemName && reportTo !== this.localName) {
                this.otherEdges[reportTo].next({type: 'AddAddress', address});
            }
        });
    }

    removeAddress(reportingSystemName: string, address: Address) {
        this.entries = this.entries.filter(e => e.address !== address || e.edgeName !== reportingSystemName);
        Object.keys(this.otherEdges).forEach(reportTo => {
            if (reportTo !== reportingSystemName && reportTo !== this.localName) {
                this.otherEdges[reportTo].next({type: 'RemoveAddress', address});
            }
        });
    }

    addRemoteSystem(systemName: string, remoteSystem: Subject<LinkMessage>) {
        this.otherEdges[systemName] = remoteSystem;
    }

    getEdgeByAddress(address: Address) {
        // todo: sort by distance
        const entry = this.entries.find(e => e.address === address);
        return entry && entry.edge;
    }
}

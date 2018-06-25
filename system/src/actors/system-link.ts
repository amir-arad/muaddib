import {Address, Message} from "./types";
import {Observable, Subject} from 'rxjs';
import {filter} from 'rxjs/operators';

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
    connectTo(name: string, addresses: string[], toRemote: Subject<LinkMessage>, fromRemote: Observable<LinkMessage>): void;

    name: string;
    addresses: string[];
}

export interface Medium {
    input: Subject<LinkMessage>;
    output: Observable<LinkMessage>;
}

export interface SystemLinkEdge {
    onAddAddress(otherSystemName: string, address: Address): void;

    onRemoveAddress(otherSystemName: string, address: Address): void;

    sendMessage(message: Message<any>): void;
}

export interface SystemLinkLocalEdge extends SystemLinkEdge, LocalEdge {
}

// TODO check with https://github.com/harunurhan/rx-socket.io-client ?
export async function connect(channel: Medium, localEdge: SystemLinkEdge & LocalEdge): Promise<void> {
    const resolution = new Promise<Handshake | HandshakeConfirm>(async (resolve) => {
        const subscription = channel.output.subscribe(async (msg: LinkMessage) => {
            // console.log(msg);
            if (isMessageType('Handshake', msg)) {
                channel.input.next({
                    type: 'HandshakeConfirm',
                    name: localEdge.name,
                    addresses: localEdge.addresses
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
        name: localEdge.name,
        addresses: localEdge.addresses
    });
    const msg = await resolution;
    localEdge.connectTo(msg.name, msg.addresses, channel.input, channel.output);
}


interface AddressBookEntry {
    edgeName: string;
    edge: Subject<LinkMessage>;
    address: Address;
}

export class SystemLinksManager implements SystemLinkEdge, LocalEdge {
    private addressBook: AddressBookEntry[] = [];
    private channels: { [systemName: string]: Subject<LinkMessage> } = {};
    public localInput = new Subject<LinkMessage>();

    constructor(private system: LocalSystem) {
        const localOutput = this.localInput.pipe(filter((m: LinkMessage) => {
            // local messages should go to local system
            if (isMessageType('SendMessage', m)) {
                this.system.sendLocalMessage(m.message);
                return false;
            }
            return true;
        }));
        this.connectTo(system.name, [], this.localInput, localOutput);
    }

    get name(): string {
        return this.system.name;
    }

    get addresses(): string[] {
        return Array.from(new Set(this.addressBook.map(e => e.address)))
    }

    connectTo(name: string, addresses: string[], toRemote: Subject<LinkMessage>, fromRemote: Observable<LinkMessage>): void {
        this.channels[name] = toRemote;
        addresses.forEach(a => this.onAddAddress(name, a));
        fromRemote.subscribe((m: LinkMessage) => {
            if (isMessageType('AddAddress', m)) {
                this.onAddAddress(name, m.address);
            } else if (isMessageType('RemoveAddress', m)) {
                this.onRemoveAddress(name, m.address);
            } else if (isMessageType('SendMessage', m)) {
                this.sendMessage(m.message);
            }
        });
    }

    onAddAddress = (reportingSystemName: string, address: Address) => {
        this.addressBook.push({edgeName: reportingSystemName, edge: this.channels[reportingSystemName], address});
        Object.keys(this.channels).forEach(reportTo => {
            if (reportTo !== reportingSystemName && reportTo !== this.system.name) {
                this.channels[reportTo].next({type: 'AddAddress', address});
            }
        });
    };

    onRemoveAddress = (reportingSystemName: string, address: Address) => {
        this.addressBook = this.addressBook.filter(e => e.address !== address || e.edgeName !== reportingSystemName);
        Object.keys(this.channels).forEach(reportTo => {
            if (reportTo !== reportingSystemName && reportTo !== this.system.name) {
                this.channels[reportTo].next({type: 'RemoveAddress', address});
            }
        });
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

    getEdgeByAddress(address: Address) {
        // todo: sort by distance
        const entry = this.addressBook.find(e => e.address === address);
        return entry && entry.edge;
    }
}

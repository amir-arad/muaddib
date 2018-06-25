import {Address, Message} from "./types";
import {NextObserver, Observable, Subject} from 'rxjs';
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

export type LinkMessage = SystemMessage | Handshake | HandshakeConfirm;
export type SystemMessage = SendMessage | AddAddress | RemoveAddress;

export function isMessageType<T extends keyof MessageTypeMap>(t: T, m: LinkMessage): m is MessageTypeMap[T] {
    return m.type === t;
}

export interface LocalSystem {
    name: string;

    sendLocalMessage(message: Message<any>): void;
}

export interface LocalEdge {
    connectAnonymousSystem(input: Observable<LinkMessage>): Observable<LinkMessage>;
    name: string;
    addresses: string[];
}

interface AddressBookEntry {
    edgeName: string;
    edge: NextObserver<SystemMessage>;
    address: Address;
}

export class SystemLinksManager implements LocalEdge {
    private addressBook: AddressBookEntry[] = [];
    private channels: { [systemName: string]: NextObserver<SystemMessage> } = {};
    public localInput = new Subject<SystemMessage>();

    constructor(private system: LocalSystem) {
        const localOutput = this.localInput.pipe(filter((m: SystemMessage) => {
            // local messages should go to local system
            if (isMessageType('SendMessage', m)) {
                this.system.sendLocalMessage(m.message);
                return false;
            }
            return true;
        }));
        this.connectNamedSystem(system.name, [], localOutput).subscribe(this.localInput);
    }

    get name(): string {
        return this.system.name;
    }

    get addresses(): string[] {
        return Array.from(new Set(this.addressBook.map(e => e.address)))
    }

    connectAnonymousSystem(input: Observable<LinkMessage>): Observable<LinkMessage> {
        const result = new Subject<LinkMessage>();
        const handshakeTimeout = setTimeout(() => {
            result.next({
                type: 'Handshake',
                name: this.name,
                addresses: this.addresses
            });
        }, 5 + Math.random() * 45);
        // TODO: promise from rxjs
        new Promise<Handshake | HandshakeConfirm>((resolve) => {
            const subscription = input.subscribe((msg: LinkMessage) => {
                if (isMessageType('Handshake', msg)) {
                    result.next({
                        type: 'HandshakeConfirm',
                        name: this.name,
                        addresses: this.addresses
                    });
                    clearTimeout(handshakeTimeout);
                    subscription.unsubscribe();
                    resolve(msg);
                } else if (isMessageType('HandshakeConfirm', msg)) {
                    subscription.unsubscribe();
                    resolve(msg);
                }
            });
        }).then(msg => {
            const systemMessagesFromRemote = input.pipe(filter((m: LinkMessage): m is SystemMessage => {
                return isMessageType('SendMessage', m) || isMessageType('AddAddress', m) || isMessageType('RemoveAddress', m);
            }));
            return this.connectNamedSystem(msg.name, msg.addresses, systemMessagesFromRemote).subscribe(result);
        });
        return result;
    }

    connectNamedSystem(name: string, addresses: string[], fromRemote: Observable<SystemMessage>): Observable<SystemMessage> {
        const result = new Subject<SystemMessage>();
        this.channels[name] = result;
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
        return result;
    }

    onAddAddress(reportingSystemName: string, address: Address) {
        this.addressBook.push({edgeName: reportingSystemName, edge: this.channels[reportingSystemName], address});
        Object.keys(this.channels).forEach(reportTo => {
            if (reportTo !== reportingSystemName && reportTo !== this.system.name) {
                this.channels[reportTo].next({type: 'AddAddress', address});
            }
        });
    };

    onRemoveAddress(reportingSystemName: string, address: Address) {
        this.addressBook = this.addressBook.filter(e => e.address !== address || e.edgeName !== reportingSystemName);
        Object.keys(this.channels).forEach(reportTo => {
            if (reportTo !== reportingSystemName && reportTo !== this.system.name) {
                this.channels[reportTo].next({type: 'RemoveAddress', address});
            }
        });
    };

    sendMessage(message: Message<any>): boolean {
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

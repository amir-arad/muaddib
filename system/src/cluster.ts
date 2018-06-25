import {Address, ClusterNode, Message} from "./types";
import {NextObserver, Observable, Subject} from 'rxjs';
import {filter, take} from 'rxjs/operators';

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
    route: string[];
    address: Address;
}

export interface RemoveAddress {
    type: 'RemoveAddress';
    route: string[];
    address: Address;
}

export interface SendMessage {
    type: 'SendMessage';
    route: string[];
    message: Message<any>;
}

export type MessageTypeMap = {
    AddAddress: AddAddress;
    RemoveAddress: RemoveAddress;
    SendMessage: SendMessage;
    Handshake: Handshake;
    HandshakeConfirm: HandshakeConfirm
}

export type ClusterMessage = SystemMessage | Handshake | HandshakeConfirm;
export type SystemMessage = SendMessage | AddAddress | RemoveAddress;

export function isMessageType<T extends keyof MessageTypeMap>(t: T, m: ClusterMessage): m is MessageTypeMap[T] {
    return m.type === t;
}

export interface LocalSystem {
    name: string;

    sendLocalMessage(message: Message<any>): void;
}

interface AddressBookEntry {
    edgeName: string;
    address: Address;
}

export interface Postal {
    addAddress(address: Address): void;

    removeAddress(address: Address): void;

    sendMessage(message: Message<any>): boolean;
}

// TODO: replace handshake with auto discovery (broadcasting by default, and sniffing messages to narrow it down)
// blocked by: adding "from" field to messages, at-least-once delivery, giving up on "UndeliveredMessage" event or adding ack and nack to protocol
export class SystemClusterNode implements ClusterNode, Postal {
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

    connect(fromRemote: Observable<ClusterMessage>): Observable<ClusterMessage> {
        const toRemote = new Subject<ClusterMessage>();
        // if nothing else happens, initiate handshake within 5-50 ms
        const handshakeTimeout = setTimeout(() => {
            toRemote.next({
                type: 'Handshake',
                name: this.name,
                addresses: this.addresses
            });
        }, 5 + Math.random() * 45);

        // wait for other side's handshake initiative and respond
        const handShakeConfirmation = fromRemote.subscribe(msg => {
            if (isMessageType('Handshake', msg)) {
                clearTimeout(handshakeTimeout); // no need to initiate handshake
                toRemote.next({
                    type: 'HandshakeConfirm',
                    name: this.name,
                    addresses: this.addresses
                });
            }
        });
        // wait for either handshake initiative or confirmation (race)
        fromRemote.pipe(
            filter((msg): msg is Handshake | HandshakeConfirm => isMessageType('Handshake', msg) || isMessageType('HandshakeConfirm', msg)),
            take(1)
        ).subscribe(msg => {
            handShakeConfirmation.unsubscribe(); // no need to confirm handshake
            // create sub-stream of only SystemMessage
            const systemMessagesFromRemote = fromRemote.pipe(filter((m: ClusterMessage): m is SystemMessage => {
                return isMessageType('SendMessage', m) || isMessageType('AddAddress', m) || isMessageType('RemoveAddress', m);
            }));
            // connect to the remote system
            return this.connectNamedSystem(msg.name, msg.addresses, systemMessagesFromRemote).subscribe(toRemote);
        });
        return toRemote;
    }

    connectNamedSystem(name: string, addresses: string[], fromRemote: Observable<SystemMessage>): Observable<SystemMessage> {
        const toRemote = new Subject<SystemMessage>();
        this.channels[name] = toRemote;
        addresses.forEach(a => this.addAddress(a, [name])); // todo: add system name to addresses list
        fromRemote.subscribe((m: ClusterMessage) => {
            if (isMessageType('AddAddress', m)) {
                this.addAddress(m.address, m.route);
            } else if (isMessageType('RemoveAddress', m)) {
                this.removeAddress(m.address, m.route);
            } else if (isMessageType('SendMessage', m)) {
                this.sendMessage(m.message, m.route);
            }
        });
        return toRemote;
    }

    private broadcast(message: SystemMessage) {
        Object.keys(this.channels).forEach(reportTo => {
            if (!message.route.includes(reportTo)) {
                this.channels[reportTo].next(message);
            }
        });
    }

    addAddress(address: Address, route?: string[]) {
        const edgeName = route? route[route.length-1] : this.system.name;
        route = route? route.concat(this.system.name) : [this.system.name];
        this.addressBook.push({edgeName, address});
        this.broadcast({type: 'AddAddress', address, route});

    };

    removeAddress(address: Address, route?: string[]) {
        const edgeName = route? route[route.length-1] : this.system.name;
        route = route? route.concat(this.system.name) : [this.system.name];
        this.addressBook = this.addressBook.filter(e => e.address !== address || e.edgeName !== edgeName);
        this.broadcast( {type: 'RemoveAddress', address, route});
    };

    sendMessage(message: Message<any>, route?: string[]): boolean {
        // look for another system to send the message to
        // todo: sort by distance?
        const entry = this.addressBook.find(e => e.address === message.to && (!route || !route.includes(e.edgeName)));
        if (entry && this.channels[entry.edgeName]) {
            route = route? route.concat(this.system.name) : [this.system.name];
            this.channels[entry.edgeName].next({type: 'SendMessage', message, route});
            return true;
        } else {
            return false;
        }
    };
}

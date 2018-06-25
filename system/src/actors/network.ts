import {Address, Message, NetworkNode} from "./types";
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

interface AddressBookEntry {
    edgeName: string;
    edge: NextObserver<SystemMessage>;
    address: Address;
}

export class NetworkManager implements NetworkNode {
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

    connect(fromRemote: Observable<LinkMessage>): Observable<LinkMessage> {
        const toRemote = new Subject<LinkMessage>();
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
            const systemMessagesFromRemote = fromRemote.pipe(filter((m: LinkMessage): m is SystemMessage => {
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
        addresses.forEach(a => this.addAddress(name, a));
        fromRemote.subscribe((m: LinkMessage) => {
            if (isMessageType('AddAddress', m)) {
                this.addAddress(name, m.address);
            } else if (isMessageType('RemoveAddress', m)) {
                this.removeAddress(name, m.address);
            } else if (isMessageType('SendMessage', m)) {
                this.sendMessage(m.message);
            }
        });
        return toRemote;
    }

    private broadcast(reportingSystemName: string, message : AddAddress | RemoveAddress){
        Object.keys(this.channels).forEach(reportTo => {
            if (reportTo !== reportingSystemName && reportTo !== this.system.name) {
                this.channels[reportTo].next(message);
            }
        });
    }
    addAddress(reportingSystemName: string, address: Address) {
        this.addressBook.push({edgeName: reportingSystemName, edge: this.channels[reportingSystemName], address});
        this.broadcast(reportingSystemName, {type: 'AddAddress', address});

    };

    removeAddress(reportingSystemName: string, address: Address) {
        this.addressBook = this.addressBook.filter(e => e.address !== address || e.edgeName !== reportingSystemName);
        this.broadcast(reportingSystemName, {type: 'RemoveAddress', address});
    };

    sendMessage(message: Message<any>): boolean {
        // look for another system to send the message to
        // todo: sort by distance
        const entry = this.addressBook.find(e => e.address === message.to);
        if (entry) {
            entry.edge.next({type: 'SendMessage', message});
            return true;
        } else {
            return false;
        }
    };
}

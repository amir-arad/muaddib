import {Address, Message} from "./types";
import {NextObserver, Observable, Subject} from 'rxjs';
import {filter, take} from 'rxjs/operators';

export interface Handshake {
    type: 'Handshake';
    nodeId: string;
    addresses: RoutingOption[];
}

export interface HandshakeConfirm {
    type: 'HandshakeConfirm';
    nodeId: string;
    addresses: RoutingOption[];
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
    id: string;

    sendLocalMessage(message: Message<any>): void;
}

interface RoutingEntry extends RoutingOption {
    nodeId: string;
}

interface RoutingOption {
    distance: number;
    address: Address;
}

export interface Postal {
    addAddress(address: Address): void;

    removeAddress(address: Address): void;

    sendMessage(message: Message<any>): boolean;
}
export interface ClusterNode {
    connect(input: Observable<ClusterMessage>): Observable<ClusterMessage>;
}

export class SystemClusterNode implements ClusterNode, Postal {
    private routingEntries: RoutingEntry[] = [];
    private routingTable: { [address: string]: RoutingEntry } = {};
    private nodes: { [nodeId: string]: NextObserver<SystemMessage> } = {};
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
        this.connectIdentified(system.id, [], localOutput).subscribe(this.localInput);
    }

    get nodeId(): string {
        return this.system.id;
    }

    get addresses(): RoutingOption[] {
        return Object.keys(this.routingTable).map(address => ({
            address,
            distance: this.routingTable[address].distance + 1
        }));
    }

    // TODO: replace (or wrap?) handshake with auto discovery (start naive, sniff messages to learn topology)
    // blocked by: adding "from" field to messages, at-least-once delivery, giving up on "UndeliveredMessage" event or adding ack and nack to protocol
    connect(fromRemote: Observable<ClusterMessage>): Observable<ClusterMessage> {
        const toRemote = new Subject<ClusterMessage>();
        // if nothing else happens, initiate handshake within 5-50 ms
        const handshakeTimeout = setTimeout(() => {
            toRemote.next({
                type: 'Handshake',
                nodeId: this.nodeId,
                addresses: this.addresses
            });
        }, 5 + Math.random() * 45);

        // wait for other side's handshake initiative and respond
        const handShakeConfirmation = fromRemote.subscribe(msg => {
            if (isMessageType('Handshake', msg)) {
                clearTimeout(handshakeTimeout); // no need to initiate handshake
                toRemote.next({
                    type: 'HandshakeConfirm',
                    nodeId: this.nodeId,
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
            return this.connectIdentified(msg.nodeId, msg.addresses, systemMessagesFromRemote).subscribe(toRemote);
        });
        return toRemote;
    }

    connectIdentified(nodeId: string, entries: RoutingOption[], fromRemote: Observable<SystemMessage>): Observable<SystemMessage> {
        const toRemote = new Subject<SystemMessage>();
        this.nodes[nodeId] = toRemote;
        entries.forEach(entry => this.addAddress(entry.address, [nodeId], entry.distance));
        fromRemote.subscribe((m: ClusterMessage) => {
            if (isMessageType('AddAddress', m)) {
                this.addAddress(m.address, m.route, m.route.length);
            } else if (isMessageType('RemoveAddress', m)) {
                this.removeAddress(m.address, m.route);
            } else if (isMessageType('SendMessage', m)) {
                this.sendMessage(m.message, m.route);
            }
        });
        return toRemote;
    }

    private broadcast(message: SystemMessage) {
        Object.keys(this.nodes).forEach(reportTo => {
            if (!message.route.includes(reportTo)) {
                this.nodes[reportTo].next(message);
            }
        });
    }

    addAddress(address: Address, route?: string[], distance = 0) {
        const nodeId = route ? route[route.length - 1] : this.system.id;
        route = route ? route.concat(this.system.id) : [this.system.id];
        const newEntry = {nodeId, address, distance};
        this.routingEntries.push(newEntry);
        const routingEntry = this.routingTable[address];
        if (!routingEntry || routingEntry.distance > distance) {
            this.routingTable[address] = newEntry;
        }
        this.broadcast({type: 'AddAddress', address, route});
    };

    removeAddress(address: Address, route?: string[]) {
        const nodeId = route ? route[route.length - 1] : this.system.id;
        route = route ? route.concat(this.system.id) : [this.system.id];
        this.routingEntries = this.routingEntries.filter(e => e.address !== address || e.nodeId !== nodeId);
        const routingEntry = this.routingTable[address];
        if (routingEntry && routingEntry.nodeId === nodeId) {
            // look for the new shortest distance to the address
            const bestRoute = this.routingEntries.filter(e => e.address === address).sort((e1, e2) => e2.distance - e1.distance).pop();
            if (bestRoute) {
                this.routingTable[address] = bestRoute;
            } else {
                delete this.routingTable[address];
            }
        }
        this.broadcast({type: 'RemoveAddress', address, route});
    };

    sendMessage(message: Message<any>, route?: string[]): boolean {
        // look for another system to send the message to
        const nodeId = this.routingTable[message.to].nodeId;
        // todo: if nodeId is in the route, look in routingEntries for an alternative
        if (nodeId) {
            route = route ? route.concat(this.system.id) : [this.system.id];
            this.nodes[nodeId].next({type: 'SendMessage', message, route});
            return true;
        } else {
            return false;
        }
    };
}

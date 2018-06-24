import {Address, Message, SystemLinkEdge} from "./types";


export interface SystemInternal {
    name: string;

    sendMessage(message: Message<any>): void;
}

export class SystemLinksManager implements SystemLinkEdge {
    private addressBook: AddressBook;

    constructor(private system: SystemInternal) {
        this.addressBook = new AddressBook(system.name);
    }

    async connectTo(remoteSystem: SystemLinkEdge) {
        const name = await remoteSystem.name();
        this.addressBook.addRemoteSystem(name, remoteSystem);
        const allAddresses = await remoteSystem.getAllAddresses();
        allAddresses.forEach(a => this.onAddAddress(name, a));
    }

    // TODO: change to property that is transfered with the object
    name = (): Promise<string> => {
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

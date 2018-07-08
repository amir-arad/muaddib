import {Address, Message} from "./types";
import {Index} from "./dependencies";

export interface MessageSent {
    type: 'MessageSent';
    message: Message<any>;
}

export interface UndeliveredMessage {
    type: 'UndeliveredMessage';
    message: Message<any>;
}

export interface LogEvent {
    type: 'LogEvent';
    source: Address;
    message: any[];
}

export interface UnhandledMessage {
    type: 'UnhandledMessage';
    source: Address;
    message: Message<any>;
    stack?: string;
}

export interface ActorCreated {
    type: 'ActorCreated';
    address: Address;
}

export interface ActorDestroyed {
    type: 'ActorDestroyed';
    address: Address;
}

export interface ProvisioningSet {
    type: 'ProvisioningSet';
    key: Index;
}

export interface ProvisioningSupplied {
    type: 'ProvisioningSupplied';
    consumer: Address;
    key: Index;
    resultSize: number;
    quantity: string;
}

export interface ProvisioningSupplyError {
    type: 'ProvisioningSupplyError';
    consumer: Address;
    key: Index;
    quantity: string;
    error: string;
}

export type SystemLogEvents =
    MessageSent
    | UndeliveredMessage
    | UnhandledMessage
    | ActorCreated
    | ActorDestroyed
    | ProvisioningSet
    | ProvisioningSupplied
    | ProvisioningSupplyError
    | LogEvent;

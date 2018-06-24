import {Serializable} from "./serializeable";

export type Targets = string[];

export interface Message {
    type: string,
    senderId: string
}

/**
 * wrapper for optional metadata layers
 * used by NoFeedbackEndpoint
 */
export interface WrappedMessage extends Message {
    type: 'wrapped',
    inner: Message
}

export interface HandShakeMessage extends Message {
    type: 'handshake',
    targets: Targets
}

export interface HandShakeConfirmMessage extends Message {
    type: 'handshake-confirm',
    targets: Targets
}


export interface ApplyMessage extends Message {
    type: 'apply';
    id: number;
    target: string;
    arguments: Serializable[]
}

export interface ResolveMessage extends Message {
    type: 'resolve';
    id: number;
    description: string;
    res: Serializable;
}


export interface RejectMessage extends Message {
    type: 'reject';
    id: number;
    description: string;
    reason: string;
    stack?: string;
}


export interface DisposeMessage extends Message {
    type: 'dispose';
}

export type MessageTypeMap = {
    'wrapped': WrappedMessage;
    'handshake': HandShakeMessage;
    'handshake-confirm': HandShakeConfirmMessage;
    'apply': ApplyMessage;
    'resolve': ResolveMessage;
    'reject': RejectMessage;
    'dispose': DisposeMessage;
}

export type Messages = MessageTypeMap[keyof MessageTypeMap];

export function isMessageType<T extends keyof MessageTypeMap>(t: T, m: Message): m is MessageTypeMap[T] {
    return m.type === t;
}

export type PartiaMessageEvent = { data: Message };

export function extractMessage(event: PartiaMessageEvent): Message {
    let payload: Message = event.data;
    if (isMessageType('wrapped', payload)) {
        payload = payload.inner;
    }
    return payload;
}

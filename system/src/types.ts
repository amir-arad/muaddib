import {System} from "./index";


export interface ActorContext {
    system: System;
    address: Address;
    send: (to: Address, body: Serializable) => void;
}

export interface ActorConstructor<P = void> {
    address: P extends void ? Address : (props: P) => Address;

    new(ctx: ActorContext, props: P): Actor<any>
}

export interface Actor<M extends Serializable> {

    init?: () => void | Promise<void>;

    onReceive(message: Message<M>): void | Promise<void>;
}

export type Address = string;

export interface Serializable {

}

export interface Message<T extends Serializable> {
    from?: Address;
    to: Address;
    body: T;
}

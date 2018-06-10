import {System} from "./index";

export interface ActorRef<T> {
    address: Address;

    forward(message: Message<T>): void;

    tell(message: Message<T>, sender?: ActorRef<any>): void;
}
console.log()

export interface ActorContext<T> {
    log : {
        log(...args:any[]):void;
    };
    unhandled:()=> void;
    system: System;
    // address: Address;
    self: ActorRef<T>;
    from?: ActorRef<any>;
    send: <T1>(to: ActorRef<T1>, body: T1) => void;
}

export interface ActorConstructor<P = void, M = any> {
    address: P extends void ? Address : (props: P) => Address;

    new(ctx: ActorContext<M>, props: P): Actor<any>
}

export interface Actor<M extends Serializable> {

    init?: () => void | Promise<void>;

    onReceive(message: M): void | Promise<void>;
}

export type Address = string;

export interface Serializable {

}

export interface Message<T extends Serializable> {
    from?: Address;
    to: Address;
    body: T;
}

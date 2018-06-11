import {System} from "./index";

export interface ActorRef<T> {
    address: Address;
    //
    // forward(message: Message<T>): void;
    //
    // tell(message: Message<T>, sender?: ActorRef<any>): void;
}

export interface ChildActorRef<T> extends ActorRef<T> {
    stop(): void;
}

export interface MessageContext {
    unhandled: () => void;
    replyTo?: ActorRef<any>;
}

export interface MessageAndContext<T extends Serializable> extends MessageContext {
    body: T;
}

export interface ActorContext<T> extends MessageContext {
    log: {
        log(...args: any[]): void;
    };
    system: System;
    self: ActorRef<T>;
    send: <T1 extends Serializable>(to: ActorRef<T1>, body: T1, replyTo?: ActorRef<any>) => void;
    ask: <T1 extends Serializable>(to: ActorRef<T1>, body: T1, options?: { id?: string, timeout?: number }) => Promise<MessageAndContext<any>>; // unsafe because the actor may be handling a different message when this one returns
    stop():void;
}

export interface ActorFactory<P, M> {
    create(ctx: ActorContext<M>, props: P): Actor<M> | Promise<Actor<M>>;
}

export interface ActorClass<P, M> {
    new(ctx: ActorContext<M>, props: P): ActorObject<M>;
}

export function isActorFactory<P, M>(subj: ActorDef<P, M>): subj is ActorFactory<P, M> & ActorMetadata<P> {
    return typeof (subj as any).create === 'function';
}

export interface ActorMetadata<P> {
    address: P extends void ? Address : (props: P) => Address
}

export type ActorDef<P = void, M = any> = ActorMetadata<P> & (ActorFactory<P, M> | ActorClass<P, M>);

export type Actor<M extends Serializable> = ActorObject<M> | ActorFunction<M>;

export interface ActorFunction<M extends Serializable> {
    (message: M): void | Promise<void>;
}

export interface ActorObject<M extends Serializable> {
    onReceive(message: M): void | Promise<void>;
}

export type Address = string;

export interface Serializable {

}

export interface Message<T extends Serializable> {
    replyTo?: Address;
    to: Address;
    body: T;
}

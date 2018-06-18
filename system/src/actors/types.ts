import {Observable} from 'rxjs';
import {BindContext, ResolveContext} from "../dependencies/types";

export interface ActorRef<T> {
    address: Address;

    send(body: T, replyTo?: ActorRef<any>): void;

    ask(body: T, options?: { id?: string, timeout?: number }): Promise<MessageAndContext<any>>;

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

export interface ActorSystem<D> {
    container: BindContext<D>;

    log: Observable<SystemLogEvents>;

    run(script: (ctx: ActorContext<never, D>) => void | Promise<void>, address?: Address): Promise<void>;
}

export interface ActorContext<T, D> extends MessageContext { // BindContext, ResolveContext
    container: BindContext<D> & ResolveContext<D>;

    log(...args: any[]): void;

    run(script: (ctx: ActorContext<never, D>) => void | Promise<void>, address?: Address): Promise<void>;

    self: ActorRef<T>;

    stop(): void;

    actorOf<M>(ctor: ActorDef<void, M, Partial<D>>): ChildActorRef<M>;

    actorOf<P, M>(ctor: ActorDef<P, M, Partial<D>>, props: P): ChildActorRef<M>;

    actorFor(addr: Address): ActorRef<any>;

}

export function isPromiseLike(subj: any): subj is PromiseLike<any> {
    return Boolean(subj && typeof subj.then === 'function');
}

export interface ActorFactory<P, M, D> {
    create(ctx: ActorContext<M, D>, props: P): Actor<M> | Promise<Actor<M>>;
}

export interface ActorClass<P, M, D> {
    new(ctx: ActorContext<M, D>, props: P): ActorObject<M>;
}

export function isActorFactory<P, M, D>(subj: ActorDef<P, M, D>): subj is ActorFactory<P, M, D> & ActorMetadata<P> {
    return typeof (subj as any).create === 'function';
}

export interface ActorMetadata<P> {
    address: P extends void ? Address : (props: P) => Address
}

export type ActorDef<P, M, D> = ActorMetadata<P> & (ActorFactory<P, M, D> | ActorClass<P, M, D>);

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

export type SystemLogEvents =
    MessageSent
    | UndeliveredMessage
    | UnhandledMessage
    | ActorCreated
    | ActorDestroyed
    | LogEvent;
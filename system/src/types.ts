import {ActorSystem} from "./index";
import {Observable} from 'rxjs';

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

export interface ActorSystem {

    container: BindContext;

    log: Observable<SystemLogEvents>;

    run(script: (ctx: ActorContext<never>) => void | Promise<void>, address?: Address): Promise<void>;
}

// DI:

export enum Quantity {'optional', 'single', 'any'};

export enum ProviderScope {
    'singleton', // The same instance will be returned for each request
    'template' // A new instance of the type will be created each time one is requested
}

export type ProvisioningPath = {
    key: string;
    target?: object;
}

export type DependencyProvisioning = {
    type: string;
    value: any;
    scope?: ProviderScope;
} & ProvisioningPath & (ValueProvisioning);

export type ValueProvisioning = {
    type: 'value';
    value: any;
    scope?: 'singleton'
}

export interface BindContext {
    /**
     * ignore previously set values on self and parents
     * @param {ProvisioningPath} path what to ignore
     */
    clear(path: ProvisioningPath): void;

    /**
     * define a provisioning of dependencies
     */
    set(provisioning: DependencyProvisioning): void;

    // reset(provisioning: DependencyProvisioning): void;
}

export interface ResolveContext {
    get<T>(key: string): Promise<T[]>;

    get<T>(key: string, quantity: Quantity.optional): Promise<T>;

    get<T>(key: string, quantity: Quantity.single): Promise<T>;

    get<T>(key: string, quantity: Quantity.any): Promise<Array<T>>;
}

// :DI
export interface ActorContext<T> extends MessageContext { // BindContext, ResolveContext

    container: BindContext & ResolveContext;

    log(...args: any[]): void;

    run(script: (ctx: ActorContext<never>) => void | Promise<void>, address?: Address): Promise<void>;

    self: ActorRef<T>;

    stop(): void;

    actorOf<M>(ctor: ActorDef<void, M>): ChildActorRef<M>;

    actorOf<P, M>(ctor: ActorDef<P, M>, props: P): ChildActorRef<M>;

    actorFor(addr: Address): ActorRef<any>;

}

export function isPromiseLike(subj: any): subj is PromiseLike<any> {
    return Boolean(subj && typeof subj.then === 'function');
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

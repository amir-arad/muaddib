import {ActorContext} from "./context";
import {Address, Serializable} from "../types";

export interface ActorFunction<M extends Serializable> {
    (message: M): void | Promise<void>;
}

export interface ActorObject<M extends Serializable> {
    onReceive(message: M): void | Promise<void>;
}

export type Actor<M extends Serializable> = ActorObject<M> | ActorFunction<M>;

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
    address: P extends void ? Address : Address | ((props: P) => Address)
}

export type ActorDef<P, M, D> = ActorMetadata<P> & (ActorFactory<P, M, D> | ActorClass<P, M, D>);

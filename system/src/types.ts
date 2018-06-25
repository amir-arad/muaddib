import {Observable} from 'rxjs';
import {BindContext, ResolveContext} from "./dependencies";
import {ClusterMessage, LocalSystem} from "./cluster";
import {SystemLogEvents} from "./log-events";
import {ActorRef, ChildActorRef} from "./actor/reference";
import {ActorDef} from "./actor/definition";

export type Address = string;

export interface Serializable {

}

export interface Message<T extends Serializable> {
    replyTo?: Address;
    to: Address;
    body: T;
}
export interface ClusterNode {
    connect(input: Observable<ClusterMessage>): Observable<ClusterMessage>;
}

export interface System<D> extends BindContext<D>, LocalSystem {
    cluster: ClusterNode;

    log: Observable<SystemLogEvents>;

    run: ExecutionContext<D>['run'];
}

export interface ExecutionContext<D> extends ResolveContext<D> {
    log(...args: any[]): void;

    run(script: (ctx: ExecutionContext<D>) => any, address?: Address): Promise<void>;

    actorOf<M>(ctor: ActorDef<void, M, D>): ChildActorRef<M>;

    actorOf<P, M1>(ctor: ActorDef<P, M1, D>, props: P): ChildActorRef<M1>;

    actorFor(addr: Address): ActorRef<any>;
}

export function isPromiseLike(subj: any): subj is PromiseLike<any> {
    return Boolean(subj && typeof subj.then === 'function');
}

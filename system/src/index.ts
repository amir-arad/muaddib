import {System} from "./types";
import {SystemImpl} from "./system";
import {Container} from "./dependencies";
import {ChildActorRef} from "./actor/reference";
import {MessageContext} from "./actor/context";

let counter = 0;

export function createSystem<D>(id: string = 'System:' + (counter++), container: Container<D> = new Container()): System<D> {
    return new SystemImpl<D>(id, container);
}

export * from './log-events'
export * from './types'
export * from "./actor/definition";
export {ActorContext, MessageContext, MessageAndContext} from "./actor/context";
export {ActorRef, ChildActorRef} from "./actor/reference";

export {isMessageType, ClusterMessage, SystemMessage} from './cluster'
export * from './dependencies'

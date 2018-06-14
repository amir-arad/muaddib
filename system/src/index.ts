///<reference path="actor-system.ts"/>
import {ActorSystem} from "./types";
import {} from "./dependencies";
import {ActorSystemImpl} from "./actor-system";

export {nullActor} from './actor-system'
export * from './types'


export function createActorSystem(): ActorSystem {
    return new ActorSystemImpl();
}

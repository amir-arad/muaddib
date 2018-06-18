import {ActorSystem} from "./actors/types";
import {ActorSystemImpl} from "./actors/actor-system";

export {nullActor} from './actors/actor-system'

export * from './actors/types'
export * from './dependencies/types'


export function createActorSystem(): ActorSystem {
    return new ActorSystemImpl();
}

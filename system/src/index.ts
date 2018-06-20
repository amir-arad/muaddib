import {ActorSystem} from "./actors/types";
import {ActorSystemImpl} from "./actors/actor-system";
import {Container} from "./dependencies/dependencies";

export {Container} from "./dependencies/dependencies";
export {nullActor} from './actors/actor-system'
export * from './actors/types'
export * from './dependencies/types'


export function createActorSystem<D>(container: Container<D> = new Container()): ActorSystem<D> {
    return new ActorSystemImpl<D>(container);
}

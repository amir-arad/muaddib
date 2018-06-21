import {ActorSystem} from "./actors/types";
import {ActorSystemImpl} from "./actors/actor-system";
import {Container} from "./dependencies/dependencies";

export * from './actors/types'
export * from './dependencies/types'

let counter = 0;

export function createActorSystem<D>(name: string = 'System:' + (counter++), container: Container<D> = new Container()): ActorSystem<D> {
    return new ActorSystemImpl<D>(name, container);
}

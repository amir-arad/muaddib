import {System} from "./actors/types";
import {SystemImpl} from "./actors/system";
import {Container} from "./dependencies/dependencies";

export * from './actors/types'
export * from './dependencies/types'

let counter = 0;

export function createSystem<D>(name: string = 'System:' + (counter++), container: Container<D> = new Container()): System<D> {
    return new SystemImpl<D>(name, container);
}

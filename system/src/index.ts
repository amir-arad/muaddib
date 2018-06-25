import {System} from "./types";
import {SystemImpl} from "./system";
import {Container} from "./dependencies";

let counter = 0;

export function createSystem<D>(id: string = 'System:' + (counter++), container: Container<D> = new Container()): System<D> {
    return new SystemImpl<D>(id, container);
}

export * from './types'
export {isMessageType, ClusterMessage, SystemMessage} from './cluster'
export * from './dependencies'

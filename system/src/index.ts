import {System} from "./types";
import {SystemImpl} from "./system";
import {Container} from "./dependencies";

let counter = 0;

export function createSystem<D>(name: string = 'System:' + (counter++), container: Container<D> = new Container()): System<D> {
    return new SystemImpl<D>(name, container);
}

export * from './types'
export {isMessageType, LinkMessage, SystemMessage} from './network'
export * from './dependencies'

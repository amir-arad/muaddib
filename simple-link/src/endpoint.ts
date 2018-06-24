import {Message, Messages, PartiaMessageEvent} from "./message";
import {ConnectionConfig} from "./connect";


export interface Endpoint {
    postMessage(message: Messages): void

    addEventListener(type: 'message', handler: (event: PartiaMessageEvent) => void): void;

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: {}): void;
}

function isMessagePort(endpoint: Endpoint): endpoint is MessagePort {
    return endpoint.constructor.name === 'MessagePort';
}

export function activateEndpoint(endpoint: Endpoint): void {
    if (isMessagePort(endpoint))
        endpoint.start();
}

export function post<M extends Message>(config: ConnectionConfig, message: M) {
    try {
        config.target.postMessage(message as any);
        //  console.log(config.thisSideId + '->' + config.otherSideId + ':', message.type, (message as any).target || (message as any).description || '')//JSON.stringify(message, null, 4))
        //  console.log(config.thisSideId + '->' + config.otherSideId + ':', message.type, JSON.stringify(message, null, 4))
    } catch (err) {
        console.log(config.thisSideId + '->' + config.otherSideId + ':failed to execute PostMessage \n target:', config.target, 'message:', message)
    }
}

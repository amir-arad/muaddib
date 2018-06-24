import * as socketIo from 'socket.io';
import {deserialize, serialize} from './serializer';
import {Endpoint} from "./endpoint";
import {Message} from "./message";


function isEventListenerObject(obj: any): obj is EventListenerObject {
    return !!obj.handleEvent;
}

export function nodeSocketEndPoint(socket: socketIo.Socket): Endpoint {
    const handlers: Map<Function, Function> = new Map();
    return {
        addEventListener(type: 'message', handler: (event: MessageEvent) => void) {
            if (handlers.has(handler)) {
                return;
            }
            const wrappedHandler = (ev: MessageEvent) => {
                handler({
                    data: deserialize(ev.data)
                } as any)
            }
            handlers.set(handler, wrappedHandler);
            socket.on(type, wrappedHandler);
        },
        removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: {}): void {
            let handler: Function;
            if (isEventListenerObject(listener)) {
                handler = listener.handleEvent;
            } else {
                handler = listener;
            }
            if (handlers.has(handler)) {
                socket.removeListener(type, handlers.get(handler) as any);
            }
        },
        postMessage: (message: Message) => {
            // console.log('postMessage '+JSON.stringify(message,null,4))
            socket.emit('message', {
                type: 'message',
                data: serialize(message)
            });
        },
    } as Endpoint;
}

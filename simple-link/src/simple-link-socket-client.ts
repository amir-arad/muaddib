import 'socket.io-client';
import {deserialize, serialize} from './serializer';
import {Endpoint} from "./endpoint";
import {Message} from "./message";

export function socketEndpoint(socket: SocketIOClient.Socket): Endpoint {
    const handlers: Map<Function, Function> = new Map();
    return {
        addEventListener: (type: 'message', handler: (ev: MessageEvent) => void) => {
            if (handlers.has(handler)) {
                return;
            }
            const wrappedHandler = (ev: MessageEvent) => {
                handler({
                    data: deserialize(ev.data)
                } as any)
            };
            handlers.set(handler, wrappedHandler);
            socket.on(type, wrappedHandler);
        },

        removeEventListener: (type: 'message', handler: (ev: MessageEvent) => void) => {
            if (handlers.has(handler)) {
                return socket.off(type, handlers.get(handler));
            }

        },
        postMessage: (message: Message) => {
            socket.emit('message', {
                type: 'message',
                data: serialize(message)
            });
        },
    } as Endpoint;
}

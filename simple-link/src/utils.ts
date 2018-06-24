/**
 * wrap an endpoint so it never receives its own messages
 * for communication over pub-sub
 */
import {Endpoint} from "./endpoint";
import {isMessageType, Message, Messages} from "./message";


let counter = 0;

export function nextId() {
    return counter++;
}

export function windowEndpoint(targetWindow: Window, sourceWindow: Window = self): Endpoint {
    const listeners: { orig: any, wrapped: any }[] = [];
    return {
        sourceWindow, targetWindow, // for debugging
        addEventListener(type: 'message', handler: (event: { data: Message }) => void) {
            const wrappedListener = (event: MessageEvent) => {
                if (targetWindow === event.source) {
                    handler(event);
                }
            }
            sourceWindow.addEventListener(type, wrappedListener);
            listeners.push({
                orig: handler,
                wrapped: wrappedListener
            })
        },
        removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: {}): void {
            const idx = listeners.findIndex((listenerObj) => listenerObj.orig === listener);
            if (idx === -1) {
                throw new Error('connect remove unexisting listener');
            }
            const listenerObj = listeners.splice(idx, 1)[0];
            sourceWindow.removeEventListener(type, listenerObj.wrapped)
        },
        postMessage: (message: Message) => targetWindow.postMessage(message, '*'),
    } as Endpoint;
}


export function shallowClone(target: any) {
    const res: any = {};
    Object.keys(target).forEach((key: string) => {
        res[key] = target[key];
    });
    return res;
}

export class NoFeedbackEndpoint implements Endpoint {
    private id = nextId() + '';
    private listeners: { orig: any, wrapped: any }[] = [];

    constructor(private ep: Endpoint) {

    }

    postMessage(inner: Messages): void {
        this.ep.postMessage({type: 'wrapped', senderId: this.id, inner});
    }

    addEventListener(type: 'message', handler: (event: { data: Message }) => void): void {
        const wrappedListener = (event: { data: Message }) => {
            if (!isMessageType('wrapped', event.data) || event.data.senderId !== this.id) {
                handler(event);
            }
        }
        this.ep.addEventListener(type, wrappedListener);
        this.listeners.push({
            orig: handler,
            wrapped: wrappedListener
        })
    }

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: {}): void {
        const idx = this.listeners.findIndex((listenerObj) => listenerObj.orig === listener);
        if (idx === -1) {
            throw new Error('connect remove unexisting listener');
        }
        const listenerObj = this.listeners.splice(idx, 1)[0];
        this.ep.removeEventListener(type, listenerObj.wrapped)
    }
}

import {Serializable} from "./serializeable";


export type ExposableAPI = {}

export interface Message {
    type: string,
    senderId: string
}

export type Targets = string[];

/**
 * wrapper for optional metadata layers
 * used by NoFeedbackEndpoint
 */
export interface WrappedMessage extends Message {
    type: 'wrapped',
    inner: Message
}

export interface HandShakeMessage extends Message {
    type: 'handshake',
    targets: Targets
}

export interface HandShakeConfirmMessage extends Message {
    type: 'handshake-confirm',
    targets: Targets
}


export interface ApplyMessage extends Message {
    type: 'apply';
    id: number;
    target: string;
    arguments: Serializable[]
}

export interface ResolveMessage extends Message {
    type: 'resolve';
    id: number;
    description: string;
    res: Serializable;
}


export interface RejectMessage extends Message {
    type: 'reject';
    id: number;
    description: string;
    reason: string;
    stack?: string;
}


export interface DisposeMessage extends Message {
    type: 'dispose';
}

export type MessageTypeMap = {
    'wrapped': WrappedMessage;
    'handshake': HandShakeMessage;
    'handshake-confirm': HandShakeConfirmMessage;
    'apply': ApplyMessage;
    'resolve': ResolveMessage;
    'reject': RejectMessage;
    'dispose': DisposeMessage;
}

function isMessageType<T extends keyof MessageTypeMap>(t: T, m: Message): m is MessageTypeMap[T] {
    return m.type === t;
}

export interface ConnectionConfig {
    thisSideId: string;
    otherSideId: string;
    target: Endpoint;
}

export interface Endpoint {
    postMessage(message: Serializable): void

    //   postMessage(message: any, transfer?: any[]): void;
    addEventListener(type: 'message', handler: (event: MessageEvent) => void): void;

    //   addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: {}): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: {}): void;
}

function isMessagePort(endpoint: Endpoint): endpoint is MessagePort {
    return endpoint.constructor.name === 'MessagePort';
}

function activateEndpoint(endpoint: Endpoint): void {
    if (isMessagePort(endpoint))
        endpoint.start();
}


function shallowClone(target: any) {
    const res: any = {};
    Object.keys(target).forEach((key: string) => {
        res[key] = target[key];
    })
    return res;
}

function fillProxy(proxy: any, inner: any) {
    Object.keys(inner).forEach((key: string) => {
        if (!proxy[key]) {
            proxy[key] = (...args: any[]) => inner[key].apply(inner, args);
        }
    })
    return proxy;
}

interface RemoteApiData {
    dispose: () => void,
    proxy: any,
    innerRemoteApi: any
}

interface ConnectionData {
    config: ConnectionConfig,
    localApi: { api: any },
    remoteApi: RemoteApiData
};
const connections: ConnectionData[] = [];

export async function connect<ResAPI extends ExposableAPI>(config: ConnectionConfig, offeredAPI: ExposableAPI): Promise<ResAPI> {
    activateEndpoint(config.target);
    const offeredCapabilites = getCapablities(offeredAPI);
    let otherTargets: string[] = [];
    const wrappedOfferedApi = {api: offeredAPI};
    let proxyCreated = false;
    let remoteApi:RemoteApiData
    remoteApi = await new Promise<RemoteApiData>((resolveConnection) => {

        config.target.addEventListener('message', (event: MessageEvent) => {
            const payload: Message = extractMessage(event);
            if (payload.senderId !== config.otherSideId) {
                return;
            }
            if (isMessageType('handshake', payload)) {
                post(config, {
                    type: 'handshake-confirm',
                    targets: offeredCapabilites,
                    senderId: config.thisSideId
                });
                otherTargets = payload.targets;
                proxyCreated = true;
                resolveConnection(buildProxy(config, otherTargets, wrappedOfferedApi));
            } else if (isMessageType('handshake-confirm', payload)) {
                otherTargets = payload.targets;
                if(!proxyCreated){
                    resolveConnection(buildProxy(config, otherTargets, wrappedOfferedApi));
                }
            }
        });
        post(config, {
            type: 'handshake',
            targets: offeredCapabilites,
            senderId: config.thisSideId
        });
    });

    connections.push({
        config,
        localApi: wrappedOfferedApi,
        remoteApi
    });

    return remoteApi.proxy;
}

function post<M extends Message>(config: ConnectionConfig, message: M) {
    try {
        config.target.postMessage(message as any);

        //  console.log(config.thisSideId + '->' + config.otherSideId + ':', message.type, (message as any).target || (message as any).description || '')//JSON.stringify(message, null, 4))
        //  console.log(config.thisSideId + '->' + config.otherSideId + ':', message.type, JSON.stringify(message, null, 4))
    } catch (err) {
        console.log(config.thisSideId + '->' + config.otherSideId + ':failed to execute PostMessage \n target:', config.target, 'message:', message)
    }
}


function getCapablities(api: ExposableAPI): string[] {
    return Object.keys(api);
}

let counter = 0;

function nextId() {
    return counter++;
}


type PendingCB = { id: number, resolve: Function, reject: Function, toString(): string };

function extractMessage(event: MessageEvent): Message {
    let payload: Message = event.data;
    if (isMessageType('wrapped', payload)) {
        payload = payload.inner;
    }
    return payload;
}


function buildProxy(config: ConnectionConfig, targets: Targets, offeredAPI: { api: any }): RemoteApiData {

    const proxy: any = {};
    const inner: any = {};
    const pendingCallbacks: PendingCB[] = [];

    const dispose = (fromOtherSide: boolean = false) => {
        config.target.removeEventListener('message', messageListener as any);
        const notifyDisposed = (event: MessageEvent) => {
            const payload = extractMessage(event);
            if (payload.senderId === config.otherSideId) {
                post<DisposeMessage>(config, {type: 'dispose', senderId: config.thisSideId});
                config.target.removeEventListener('message', notifyDisposed as any);
            }
        }
        config.target.addEventListener('message', notifyDisposed as any);
        Object.keys(proxy).forEach((key: string) => {
            proxy[key] = () => {
                throw new Error(fromOtherSide ? 'Connection has been disposed from the other side' : 'Connection has been disposed')
            }
        });
    }

    const res = {
        proxy,
        dispose,
        innerRemoteApi: inner
    };


    targets.forEach((target) => {
        inner[target] = function (...args: Serializable[]) {
            const id: number = nextId();
            const promise = new Promise<Serializable>((resolve, reject) => {
                pendingCallbacks.push({
                    id, reject, resolve,
                    toString() {
                        return `${target}(${args.map(a => JSON.stringify(a, null, 4)).join()})`;
                    }
                });
            });
            const message: ApplyMessage = {
                type: 'apply',
                target: target,
                id,
                arguments: args,
                senderId: config.thisSideId
            };
            post(config, message as any);

            return promise;
        };
        proxy[target] = function (...args: Serializable[]) {
            return res.innerRemoteApi[target].apply(res.innerRemoteApi, args)
        }
    });


    const messageListener = async (event: MessageEvent) => {
        const payload = extractMessage(event);
        // console.log('got:'+ (payload as any).id + config.thisSideId + '->' + config.otherSideId + ':', payload.type, (payload as any).target || (payload as any).description || '')//JSON.stringify(message, null, 4))
        // console.log(config.otherSideId + '->' + config.thisSideId + ':', payload.type, JSON.stringify(payload, null, 4))
        if (payload.senderId !== config.otherSideId) {
            return;
        }
        if (isMessageType('dispose', payload)) {
            pendingCallbacks.forEach(pending => {
                pending.reject('Connection has been disposed from the other side');
            });
            dispose(true);

        }
        if (isMessageType('apply', payload)) {
            let method = offeredAPI.api[payload.target];
            if (method) {
                let message: Message;
                 try {
                    const res = await method.apply(offeredAPI.api, payload.arguments);
                    message = <ResolveMessage>{
                        type: 'resolve',
                        description: payload.target,
                        id: payload.id,
                        res,
                        senderId: config.thisSideId
                    };
                } catch (err) {
                    let reason = 'unknown-error';
                    let stack = undefined;
                    if (typeof err === 'string') {
                        reason = err;
                    } else if (err instanceof Error) {
                        reason = err.message;
                        stack = err.stack
                    }
                    message = <RejectMessage>{
                        type: 'reject',
                        description: payload.target,
                        id: payload.id,
                        reason,
                        stack,
                        senderId: config.thisSideId
                    };

                }

                post(config, message as any);

            } else {
                throw new Error(`has no target ${payload.target}`);
            }
        } else if (isMessageType('resolve', payload)) {
            const pendingIndex = pendingCallbacks.findIndex((pending) => pending.id === payload.id);
            if (pendingIndex === -1) {
                console.error('simple-link unexpected callback:'+ (payload as any).id + config.thisSideId + '->' + config.otherSideId + ':', payload.type, (payload as any).target || (payload as any).description || '' + JSON.stringify(event, null, 4));
                throw(new Error('simple-link unexpected callback ' + payload.description))
            }
            const cb = pendingCallbacks.splice(pendingIndex, 1)[0];
            cb.resolve(payload.res);
        } else if (isMessageType('reject', payload)) {
            const pendingIndex = pendingCallbacks.findIndex((pending) => pending.id === payload.id);
            if (pendingIndex === -1) {
                console.error('simple-link unexpected callback rejection:'+ (payload as any).id + config.thisSideId + '->' + config.otherSideId + ':', payload.type, (payload as any).target || (payload as any).description || '' + JSON.stringify(event, null, 4));
                throw(new Error('simple-link unexpected callback rejection ' + payload.description));
            }
            const cb = pendingCallbacks.splice(pendingIndex, 1)[0];
            cb.reject(new RejectionError(cb.toString(), payload.senderId, payload.reason, payload.stack));
        }
    };

    config.target.addEventListener('message', messageListener);
    return res
}

class RejectionError extends Error {
    constructor(action: string, originName: string, message: string, stack?: string) {
        super(message);
        this.name = `Rejection of ${action} by '${originName}'`;
        this.message = message;
        Object.defineProperty(this, 'stack', {value: stack ? this.stack + '\n---\nRemote stack:\n' + stack : this.stack});
    }
}

/**
 * wrap an endpoint so it never receives its own messages
 * for communication over pub-sub
 */
export class NoFeedbackEndpoint implements Endpoint {
    private id = nextId() + '';
    private listeners: { orig: any, wrapped: any }[] = [];

    constructor(private ep: Endpoint) {

    }

    postMessage(inner: Serializable): void {
        this.ep.postMessage({type: 'wrapped', senderId: this.id, inner});
    }

    addEventListener(type: 'message', handler: (event: MessageEvent) => void): void {
        const wrappedListener = (event: MessageEvent) => {
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

export function windowEndpoint(targetWindow: Window, sourceWindow: Window = self): Endpoint {
    const listeners: { orig: any, wrapped: any }[] = [];
    return {
        sourceWindow, targetWindow, // for debugging
        addEventListener(type: 'message', handler: (event: MessageEvent) => void) {
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
        postMessage: (message: Serializable) => targetWindow.postMessage(message, '*'),
    } as Endpoint;
}



export function disposeConnection(proxy: any) {
    const connectionDataIndex = connections.findIndex((connection) => connection.remoteApi.proxy === proxy);

    if (connectionDataIndex === -1) {
        throw new Error('cannot clear unknown connection');
    }

    const connectionData: ConnectionData = connections.splice(connectionDataIndex, 1)[0];
    connectionData.remoteApi.dispose();

}

export function disposeAllConnections() {
    while (connections.length) {
        disposeConnection(connections[0].remoteApi.proxy)
    }
}

export function replaceRemoteApi<T>(fromLink: string, toLink: string, proxy: (replacedConnection: T) => Partial<T>) {
    const connectionData: ConnectionData | undefined = connections.find((connection) => {
        return (connection.config.thisSideId === fromLink && connection.config.otherSideId === toLink)
    });
    if (!connectionData) {
        throw new Error('replaceRemoteApi failed ' + fromLink + '->' + toLink)
    }

    connectionData.remoteApi.innerRemoteApi = fillProxy(proxy(connectionData.remoteApi.innerRemoteApi), connectionData.remoteApi.innerRemoteApi);

}

export function replaceLocalApi<T>(fromLink: string, toLink: string, proxy: (replacedConnection: T) => Partial<T>) {
    const connectionData: ConnectionData | undefined = connections.find((connection) => {
        return (connection.config.otherSideId === fromLink && connection.config.thisSideId === toLink)
    });
    if (!connectionData) {
        throw new Error('replaceLocalApi failed ' + fromLink + '->' + toLink)
    }

    connectionData.localApi.api = fillProxy(proxy(connectionData.localApi.api), connectionData.localApi.api);

}

import {nextId} from "./utils";
import {
    ApplyMessage,
    DisposeMessage,
    extractMessage,
    isMessageType,
    Message,
    RejectMessage,
    ResolveMessage,
    Targets
} from "./message";
import {Serializable} from "./serializeable";
import {ConnectionConfig} from "./connect";
import {post} from "./endpoint";


type PendingCB = { id: number, resolve: Function, reject: Function, toString(): string };

class RejectionError extends Error {
    constructor(action: string, originName: string, message: string, stack?: string) {
        super(message);
        this.name = `Rejection of ${action} by '${originName}'`;
        this.message = message;
        Object.defineProperty(this, 'stack', {value: stack ? this.stack + '\n---\nRemote stack:\n' + stack : this.stack});
    }
}

export interface RemoteApiData {
    dispose: () => void,
    proxy: any,
    innerRemoteApi: any
}

export function buildProxy(config: ConnectionConfig, targets: Targets, offeredAPI: { api: any }): RemoteApiData {

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
        };
        config.target.addEventListener('message', notifyDisposed as any);
        Object.keys(proxy).forEach((key: string) => {
            proxy[key] = () => {
                throw new Error(fromOtherSide ? 'Connection has been disposed from the other side' : 'Connection has been disposed')
            }
        });
    };

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

    const messageListener = async (event: { data: Message }) => {
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
                console.error('simple-link unexpected callback:' + (payload as any).id + config.thisSideId + '->' + config.otherSideId + ':', payload.type, (payload as any).target || (payload as any).description || '' + JSON.stringify(event, null, 4));
                throw(new Error('simple-link unexpected callback ' + payload.description))
            }
            const cb = pendingCallbacks.splice(pendingIndex, 1)[0];
            cb.resolve(payload.res);
        } else if (isMessageType('reject', payload)) {
            const pendingIndex = pendingCallbacks.findIndex((pending) => pending.id === payload.id);
            if (pendingIndex === -1) {
                console.error('simple-link unexpected callback rejection:' + (payload as any).id + config.thisSideId + '->' + config.otherSideId + ':', payload.type, (payload as any).target || (payload as any).description || '' + JSON.stringify(event, null, 4));
                throw(new Error('simple-link unexpected callback rejection ' + payload.description));
            }
            const cb = pendingCallbacks.splice(pendingIndex, 1)[0];
            cb.reject(new RejectionError(cb.toString(), payload.senderId, payload.reason, payload.stack));
        }
    };

    config.target.addEventListener('message', messageListener);
    return res
}

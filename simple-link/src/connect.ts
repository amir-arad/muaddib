import {activateEndpoint, Endpoint, post} from "./endpoint";
import {extractMessage, isMessageType, Message} from "./message";
import {buildProxy, RemoteApiData} from "./build-proxy";

export type ExposableAPI = {}

export interface ConnectionConfig {
    thisSideId: string;
    otherSideId: string;
    target: Endpoint;
}

interface ConnectionData {
    config: ConnectionConfig,
    localApi: { api: any },
    remoteApi: RemoteApiData
}

const connections: ConnectionData[] = [];

export async function connect<ResAPI extends ExposableAPI>(config: ConnectionConfig, offeredAPI: ExposableAPI): Promise<ResAPI> {
    activateEndpoint(config.target);
    const offeredCapabilites = getCapablities(offeredAPI);
    let otherTargets: string[] = [];
    const wrappedOfferedApi = {api: offeredAPI};
    let proxyCreated = false;
    let remoteApi: RemoteApiData;
    remoteApi = await new Promise<RemoteApiData>((resolveConnection) => {
        config.target.addEventListener('message', (event: { data: Message }) => {
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
                if (!proxyCreated) {
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

function getCapablities(api: ExposableAPI): string[] {
    return Object.keys(api);
}

function fillProxy(proxy: any, inner: any) {
    Object.keys(inner).forEach((key: string) => {
        if (!proxy[key]) {
            proxy[key] = (...args: any[]) => inner[key].apply(inner, args);
        }
    });
    return proxy;
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

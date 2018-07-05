
export const NODE_AUTO = 'node-auto';
export const NODE = 'node-spawn';
export type BrowserEndPointConfig = {uri:string}

import {ExecutionContext} from 'muadib-system'

export type MultiSystemConfig = {
    [scope:string]:typeof NODE_AUTO | typeof NODE | BrowserEndPointConfig
}

type ConfigurationModule<CONFIG extends MultiSystemConfig> = {
    [key:keyof CONFIG] : (ctx:ExecutionContext<{}>)=>void | Promise<void>
}

export class MultiSystem<CONFIG extends MultiSystemConfig>{
    constructor(
        private config:CONFIG
    ){}

    async loadPlugins(pluginPaths:string[]){
        pluginPaths.forEach((pluginPath)=>{
            const module = require(pluginPath) as

        })
    }
    async start(){}
}


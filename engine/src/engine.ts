
export const NODE_AUTO = 'node-auto';
export const NODE = 'node-spawn';
export type BrowserEndPointConfig = {uri:string}

import {ExecutionContext, createSystem} from 'muadib-system'

export type MultiSystemConfig = {
    [scope:string]:typeof NODE_AUTO | typeof NODE | BrowserEndPointConfig
}



export class MultiSystem<CONFIG extends MultiSystemConfig>{
    pluginsPerScope!:{[key:string]:Array<(ctx:ExecutionContext<{}>)=>void | Promise<void>>};
    constructor(
        private config:CONFIG
    ){
        this.pluginsPerScope = {};
        Object.keys(this.config).forEach(key=>{
            this.pluginsPerScope[key] = [];
        })
    }

    async loadPlugins(pluginPaths:string[]){
        pluginPaths.forEach((pluginPath)=>{
            const feature = require(pluginPath).default;
            Object.keys(this.config).forEach(key=>{
                if(feature[key]){
                    this.pluginsPerScope[key].push(feature[key])
                }
            })

        })
    }
    async start(scope:keyof CONFIG){
        const system = createSystem(scope as string);
        system.run(async (ctx)=>{
            await Promise.all(this.pluginsPerScope[scope as string].map((plugin)=>{
                plugin(ctx);
            }))
        })
    }
}


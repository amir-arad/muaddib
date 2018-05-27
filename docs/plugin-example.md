# Plugin Example
This document outlines the registration and life-cycle of a multi scope "feature plugin" as a way to show the different possible plugin types.

in this case a simple plugin that shows a render count for each react component in a panel


## Plugin index

the plugin index is a file telling the editor what plugin parts to load:

```ts
import {inject, PluginRegistry} from 'editor-core';
import { PanelRegistry, PanelRegistryKey} from 'editor-panels';
import { StoreRegistry, StoreRegistryKey} from 'editor-stores';
import { CreateElementVisitorRegistry, CreateElementVisitorRegistryKey} from 'editor-preview';


import { Types, CounterStore } from './counter-plugin.types.ts';

export const CounterPlugin = PluginRegistry.definePlugin(Types.counterPlugin, (
    @inject(PanelRegistryKey) panelRegistry:PanelRegistry,
    @inject(StoreRegistryKey) storeRegistry:StoreRegistry,
    @inject(CreateElementVisitorRegistryKey) createElementVisitorRegistry:CreateElementVisitorRegistry
    )=>{
        panelRegistry.register(Types.counterPanel,()=>import('./counter-panel.tsx'));
        storeRegistry.register(Types.counterStore,()=>import('./counter-store.ts'));
        createElementVisitorRegistry.register(Types.counterVisitor,()=>import('./counter-visitor.ts'));
    });
```

## Plugin types
the types used as the interface across plugins should be registered in a separate file.

this allows them to be used as injectables

```ts

export interface CounterStore{
    count(previewId:string, componentId:string):void;
    resetCounters():void;
    getCounters(previewId:string):{[compId:string]:number};
}

export const types = {
    counterPlugin : Registry.getUniqueKey('counterPlugin'),
    counterStore : Registry.getUniqueKey('CounterStore'),
    counterPanel :  Registry.getUniqueKey('CounterPanel'),
    counterCreateElementVisitor :  Registry.getUniqueKey('counterCreateElementVisitor'),
}


```

## Plugin store

the plugin store will be the source of truth for our plugin, storing the counter info for each component.

this plugin part will be reused across many editor windows and many previews

```ts

import {injectable, inject} from 'editor-core';
import {SerializableStore} from 'editor-stores';
import {CounterStore,TYPES} from './counter-plugin.types.ts';


@injectable(TYPES.CounterStore)
export CounterStoreImpl extends SerializableStore implements CounterStore{
    state:{[PreviewId:string]:{[CompId:string]:number}} = {};
    count(previewId:string, componentId:string):void{
        this.state[previewid] = this.state[previewid] || {};
        this.state[previewid][componentId] = this.state[previewid][componentId] || 0;
        this.state[previewid][componentId]++;
        this.triggerOnChange();
    };
    resetCounters():void{
        this.state = {};
        this.triggerOnChange();
    };
    getCounters(){
        return this.state
    }
}


```



## Plugin panel

the plugin main will show the data


```tsx

import {injectable, inject, pluggable} from 'editor-core';
import {BasePanel} from 'editor-panels';
import {TYPES, CounterStore} from './counter-plugin.types.ts';

@injectable(TYPES.CounterPanel)
export CounterPanel extends BasePanel{
    constructor(
        @inject(TYPES.CounterStore) counterStore: CounterStore
    ){}

    render(){
        return <div>
            {
                _.map(this.counterStore.getCounters(),(previewId:string, previewComponents:{[CompId:string]:number}})=>{
                    return <div>
                            <div>{previewId}</div>
                            <ul>
                            {
                                _.map(previewComponents, (compId:string,compCounter:number))=>{
                                    return <li>{compId} was rendered {compCounter} times</li>
                                });
                            }
                            </ul>
                    </div>
                })
            }
        </div>
    }
}

```



## Plugin preview userspace ( createElementVisitor )

the preview plugin fragment will send count messages to the store


```tsx

import {injectable, inject, CreateElementVisitor} from 'editor-core';
import {TYPES, CounterStore} from './counter-plugin.types.ts';


@injectable(TYPES.counterPanel)
export CounterVisitor extends CreateElementVistor{

    constructor(
        private @inject(TYPES.CounterStore) counterStore: CounterStore
    ){}

    onCreateElement(previewId:string, compUniqueId:string,type:any,props:any){
        this.counterStore.count(previewId, compUniqueId);
    }
}

```

# plugin tests

we want easy plugin testing so plugin developement can acheieve velocity.

## plugin integration tests

plugin integration tests check the integration of the plugin to the core and its dependencies.

### store integration test


```tsx

import {inject} from 'editor-core';
import {EditorRunner} from 'editor-test-runner';
import { Types } from './counter-plugin.types.ts';
import { CounterPlugin } from './counter-plugin.index.ts';

describe('counter store',()=>{
    it(' starts with 0',()=>{
        //the editor runner will run with only the counterStore plugin
        const editor = await EditorRunner.run({
            plugins:[Types.CounterPlugin]
        });

        //now the editor creates the counter store
        const injectables = await editor.getInj(Types.counterStore);

        expect(injectables[Types.counterStore].getCounter('previewA','myComp').to.equal(0);
    });
    it(' counts ',()=>{
        const injectables = await EditorRunner.run(Types.counterStore);
        injectables[Types.counterStore.count('previewA','myComp');
        expect(injectables[Types.counterStore].getCounter('previewA','myComp').to.equal(1);
    });
})


```

### panel integration test

our panel integration tests will reuse our store.

```tsx

import {PanelTypes} from 'editor-panels';
import {EditorRunner} from 'editor-test-runner';
import { Types } from './counter-plugin.types';

describe('counter panel',()=>{
    it(' starts with 0',()=>{
        //will run the editor with only these plugins
        const editor = await EditorRunner.run({
            plugins:[Types.CounterPlugin,PanelTypes.panelPlugin]
        });
        const injectables = await editor.get(
            Types.counterStore,
            Types.counterPanel,
            PanelTypes.panelManager);


        expect(injectables[Types.counterPanel]).to.includeHTML('myComp : 0')
    });
    it(' updates ',()=>{
         const editor = await EditorRunner.run({
            plugins:[Types.CounterPlugin,PanelTypes.panelPlugin]
        });
        const injectables = await editor.get(
            Types.counterStore,
            Types.counterPanel,
            PanelTypes.panelManager);

        injectables[Types.counterStore].count('previewA','myComp');

        expect(injectables[Types.counterPanel]).to.includeHTML('myComp : 1')
    });

    it(' resets ',()=>{
         const editor = await EditorRunner.run({
            plugins:[Types.CounterPlugin,PanelTypes.panelPlugin]
        });
        const injectables = await editor.get(
            Types.counterStore,
            Types.counterPanel,
            PanelTypes.panelManager);

        injectables[Types.counterStore].count('previewA','myComp');
        stSimulate(injectables[Types.counterPanel],'.reset-button').click();

        expect(injectables[Types.counterPanel]).to.includeHTML('myComp : 0')
    });
})


```

### preview createElementVisitor integration tests

our visitor integration tests will reuse our store.
they will also need to define user code to run in preview.

```tsx

import {inject} from 'editor-core';
import {PreviewTypes} from 'editor-preview';
import {EditorRunner} from 'editor-test-runner';
import { Types, CounterStore } from './counter-plugin.types.ts';

describe('counter visitor',()=>{
    it(' goes up when creating elements',()=>{
         const editor = await EditorRunner.run({
            plugins:[Types.CounterPlugin,PreviewTypes.PreviewPlugin]
        });
        const injectables = await editor.get(
            Types.counterStore,
            Types.counterVisitor,
            PreviewTypes.previewScope);
        await EditorRunner.runInScope(PreviewTypes.previewScope,`

        import * as React from 'react';

        export class MyComp extends React.Component{

        }

        React.createElement(MyComp,{});

        `,'./index.tsx')

        expect(injectables[Types.counterStore].getCounter('./index.tsx>MyComp')).to.equal(1)
    });
})
```

## feature plugin e2e

feature plugin e2e tests checks a feature plugin with all its plugin fragment parts interoperating

example TBD.

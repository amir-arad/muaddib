import {expect, plan} from "test-kit";
import {ActorContext, ActorDef, ActorObject, ActorRef, createSystem, MessageAndContext, System} from "system";
import {mainConnectToIframe, loadIframeScript} from "../src";
import {Sampler} from "./sampler";

declare global {
    interface Window {
        __testValue: string;
    }
}

describe('system', () => {
    describe('stage 4 - iframes', () => {
        it('communicate well on diffeseent window objects', plan(2, async () => {
            interface Sample {
                type: 'Sample';
                value: Window['__testValue'];
            }
            const system = createSystem('main');
            // system.log.subscribe(m => console.log(JSON.stringify(m)));

            const iframeWindow = await loadIframeScript(window.location.origin + '/test-frame.bundle.js');
            mainConnectToIframe(system, iframeWindow);

            await system.run(async ctx => {
                const sampler = await ctx.actorWaitFor(Sampler.address);
                let message = await sampler.ask({type: 'Test'});
                expect(message.body.value, 'sample from iframe window').to.eql('foo');
                expect(window.__testValue, 'sample from current window').to.not.eql('foo');

            }, 'testCase');
        }));
    });
});

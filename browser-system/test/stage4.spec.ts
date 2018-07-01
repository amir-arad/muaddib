import {expect, plan} from "test-kit";
import {ActorContext, ActorObject, ActorRef, createSystem, MessageAndContext, ActorDef} from "system";
import {FramesManager} from "../src";

declare global {
    interface Window {
        __testValue: string;
    }
}

describe('system', () => {
    describe('stage 1 - single vm, shallow plugins demo app', () => {
        it('load two plugins and have them all find and communicate with each other', plan(2, async () => {
            interface Test {
                type: 'Test';
            }
            interface Sample {
                type: 'Sample';
                value: Window['__testValue'];
            }

            class Sampler implements ActorObject<Test> {
                static address = 'sampler';

                constructor(private ctx: ActorContext<Test, {}>) {
                    window.__testValue = 'foo';
                }

                onReceive(msg: Test) {
                    if (msg.type === 'Test' && this.ctx.replyTo) {
                        this.ctx.replyTo.send({type: 'Sample', value: window.__testValue});
                    } else {
                        this.ctx.unhandled();
                    }
                }
            }

            const system = createSystem();
            // system.log.subscribe(m => console.log(JSON.stringify(m)));
            await system.run(async ctx => {
                const frames = ctx.actorOf(FramesManager);
                // TODO: create iframe, send iframe selector to actor, actor only bootstraps system in the iframe
                // Tell the 'greeter' to change its 'greeting' message
                frames.send({
                    type: 'MakeNewFrame',
                    systemId : 'frame1',
                    title : 'frame1',
                    parent : '#frameContainer',
                    script: async ctx => {
                        window.__testValue = 'foo';
                        ctx.actorOf(Sampler);
                    }
                });

                // TODO: synch with loading. add timeout to ctx.actorFor?
                const sampler = ctx.actorFor(Sampler.address);

                // Ask the 'greeter for the latest 'greeting' and catch the next message that will arrive at the mailbox
                let message = await sampler.ask({type: 'Test'});
                expect(message.body.value, 'sample from iframe window').to.eql('foo');
                expect(window.__testValue, 'sample from current window').to.not.eql('foo');
            }, 'testCase');
        }));
    });
});

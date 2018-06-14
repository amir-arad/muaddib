import {ActorContext, createActorSystem} from "../src";
import {expect, plan} from "./testkit/chai.spec";
import {Quantity} from "../src/types";

type Plugin = (i: number) => number;

type ComputationRequest = { arg: number };

describe('system', () => {
    describe('stage 2 - plugin objects', () => {
        it.only(`2nd level plugins`, plan(1, async () => {
            // have a plugin fetch objects array that implement its extention API (2nd level plugins) and use them for its BL.
            // plugin is dedicated to a specific actor.
            type InputProps = {
                id: string;
            };

            const Processor = {
                address({id}: InputProps) {
                    return `Processor:${id}`
                },
                async create(ctx: ActorContext<ComputationRequest>, props: InputProps) {
                    const plugins = await ctx.container.get<Plugin>('operation', Quantity.any);
                    const devMode = await ctx.container.get<boolean>('devMode', Quantity.optional);
                    return (msg: ComputationRequest) => {
                        if (ctx.replyTo) {
                            const result = plugins.reduce((v, o) => o(v), msg.arg);
                            ctx.replyTo.send(result);
                        } else {
                            ctx.unhandled();
                        }
                    }
                }
            };

            const p1 = (i: number) => i + 1;
            const p2 = (i: number) => i - 53;

            const system = createActorSystem();
            system.log.subscribe(m => console.log(JSON.stringify(m)));
            system.container.set({
                key: 'operation',
                type: 'value',
                value: p1,
                target: Processor
            });
            await system.run(async ctx => {
                //       ctx.container.setValue('devMode', undefined as any, true); // TODO change to 2 arguments
             //   ctx.container.clear({key: 'operation', target: Processor});
                ctx.container.set({
                    key: 'operation',
                    type: 'value',
                    value: p2,
                    target: Processor
                });
                // ctx.di.bind();
                const firstProcessor = ctx.actorOf(Processor, {id: 'first'});
                expect((await firstProcessor.ask({arg: 100})).body).to.eql(p2(p1(100)));
                // TODO: continue
            });
        }));
    });
});

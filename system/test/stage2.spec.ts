import {ActorContext, createActorSystem, Quantity} from "../src";
import {expect, plan} from "./testkit/chai.spec";

type Plugin = (i: number) => number;

type ComputationRequest = { arg: number };

describe('system', () => {
    describe('stage 2 - plugin objects', () => {
        it.only(`2nd level plugins`, plan(1, async () => {
            type Dependencies = {
                operation: Plugin;
                testScript: (ctx: ActorContext<never, Dependencies>) => any;
            }

            // have a plugin fetch objects array that implement its extention API (2nd level plugins) and use them for its BL.
            // plugin is dedicated to a specific actor.
            type InputProps = {
                id: string;
            };

            const Processor = {
                address({id}: InputProps) {
                    return `Processor:${id}`
                },
                async create(ctx: ActorContext<ComputationRequest, { operation: Plugin }>, props: InputProps) {
                    const plugins = await ctx.container.get('operation', Quantity.any);
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

            const system = createActorSystem<Dependencies>();
            system.log.subscribe(m => console.log(JSON.stringify(m)));
            system.container.set({
                key: 'testScript',
                asyncFactory: async () => async (ctx: ActorContext<never, Dependencies>) => {
                    const firstProcessor = ctx.actorOf(Processor, {id: 'first'});
                    expect((await firstProcessor.ask({arg: 100})).body).to.eql(p2(p1(100)));
                }
            });
            //   system.container.set({key: 'devMode', value: true});
      //      system.container.set({key: 'operation', value: p1, target: Processor});
            await system.run(async ctx => {
                //ctx.container.clear({key: 'operation', target: Processor});
      //          ctx.container.set({key: 'operation', value: p2, target: Processor});
                const script = await ctx.container.get('testScript', Quantity.single);
                script(ctx);
            });
        }));
    });
});

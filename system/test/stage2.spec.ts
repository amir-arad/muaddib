import {ActorContext, createActorSystem} from "../src";
import {expect, plan} from "./testkit/chai.spec";

type Plugin = (i: number) => number;

type ComputationRequest = { arg: number };

describe('system', () => {
    describe('stage 2 - plugin objects', () => {
        it.only(`2nd level plugins`, plan(1, async () => {
            // have a plugin fetch objects array that implement its extention API (2nd level plugins) and use them for its BL.
            // plugin is dedicated to a specific actor.

            type InputProps = { id: string };
            const Processor = {
                address({id}: InputProps) {
                    return `Processor:${id}`
                },
                async create(ctx: ActorContext<ComputationRequest>, props: InputProps) {
                    const plugins: Plugin[] = await ctx.resolve('operation'); //todo: quantifiers
                    const devMode: boolean = await ctx.resolve('devMode'); //todo: quantifiers
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
            await system.run(async ctx => {
         //       ctx.bindValue('devMode', undefined as any, true); // TODO change to 2 arguments
                ctx.bindValue('operation', Processor, p1);
                ctx.bindValue('operation', Processor, p2);
                const firstProcessor = ctx.actorOf(Processor, {id: 'first'});
                expect((await firstProcessor.ask({arg: 100})).body).to.eql(p2(p1(100)));
                // TODO: continue
            });
        }));
    });
});

import {createActorSystem, ActorContext, Quantity} from "../src";
import {expect, plan} from "./testkit/chai.spec";

// imagine this is a third-party plugin
namespace Processor {
    export const pluginSymbol = Symbol('operation');

    export function address({id}: Processor.InputProps) {
        return `Processor:${id}`
    }

    export async function create(ctx: ActorContext<Processor.Messages, Processor.Plugins>, props: Processor.InputProps) {
        const plugins = await ctx.container.get(Processor.pluginSymbol, Quantity.any);
        return (msg: Processor.ComputationRequest) => {
            if (ctx.replyTo) {
                const result = plugins.reduce((v, o) => o(v), msg.arg);
                ctx.replyTo.send(result);
            } else {
                ctx.unhandled();
            }
        }
    }

    export type Plugins = { [Processor.pluginSymbol]: Plugin };

    export type Messages = ComputationRequest;

    export type ComputationRequest = { arg: number };

    export type Plugin = (i: number) => number;

    export type InputProps = {
        id: string;
    };
}

describe('system', () => {
    describe('stage 2 - plugin objects', () => {
        it(`2nd level plugins`, plan(1, async () => {
            type SystemPlugins = Processor.Plugins &
                {
                    theActor: typeof Processor;
                }

            const p1: Processor.Plugin = (i: number) => i + 1;
            const p2: Processor.Plugin = (i: number) => i - 53;

            const system = createActorSystem<SystemPlugins>();
            //    system.log.subscribe(m => console.log(JSON.stringify(m)));
            system.container.set({key: 'theActor', value: Processor});
            system.container.set({key: Processor.pluginSymbol, value: p1});
            await system.run(async ctx => {
                ctx.container.set({key: Processor.pluginSymbol, value: p2});
                const firstProcessor = ctx.actorOf(Processor, {id: 'first'});
                expect((await firstProcessor.ask({arg: 100})).body).to.eql(p2(p1(100)));
            });
        }));
    });
});

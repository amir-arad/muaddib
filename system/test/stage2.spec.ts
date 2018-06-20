import {ActorContext, createActorSystem, Quantity} from "../src";
import {expect, plan} from "./testkit/chai.spec";

// simulating a third-party feature plugin module (Computation)
// with its own plugins API (Computation.Operation)
namespace Computation {
    export type Props = {
        id: string;
    };

    export type Context = {
        [Computation.opSymbol]: Operation
    };

    export namespace messages {
        export type ComputationRequest = { arg: number };
        export type All = ComputationRequest;
    }
    export const Actor = {
        address({id}: Props) {
            return `Computation:${id}`
        },

        async create(ctx: ActorContext<messages.All, Context>, props: Props) {
            const plugins = await ctx.get(opSymbol, Quantity.any);
            return (msg: messages.ComputationRequest) => {
                if (ctx.replyTo) {
                    const result = plugins.reduce((v, o) => o(v), msg.arg);
                    ctx.replyTo.send(result);
                } else {
                    ctx.unhandled();
                }
            }
        }
    };
    export const opSymbol = Symbol('operations');
    export type Operation = (i: number) => number;
}

describe('system', () => {
    describe('stage 2 - plugin objects', () => {
        it(`2nd level plugins`, plan(1, async () => {
            type SystemContext = Computation.Context &
                {
                    theActor: typeof Computation.Actor;
                }

            const p1: Computation.Operation = (i: number) => i + 1;
            const p2: Computation.Operation = (i: number) => i - 53;

            const system = createActorSystem<SystemContext>();

            system.log.subscribe(m => console.log(JSON.stringify(m)));
            system.set({key: 'theActor', value: Computation.Actor});
            system.set({key: Computation.opSymbol, value: p1});
            system.set({key: Computation.opSymbol, value: p2});
            await system.run(async ctx => {
                const actor = await ctx.get( 'theActor', Quantity.single);
                const firstProcessor = ctx.actorOf(actor, {id: 'first'});
                const request: Computation.messages.ComputationRequest = {arg: 100};
                expect((await firstProcessor.ask(request)).body).to.eql(p2(p1(100)));
            });
        }));
    });
});

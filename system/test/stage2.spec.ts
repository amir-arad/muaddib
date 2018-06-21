import {ActorContext, createActorSystem, Quantity} from "../src";
import {expect, plan} from "./testkit/chai.spec";

// namespace to simulate another module, instead of:
// import * as computation from './computation'
namespace computation {
    // this is a feature plugin module
    // with its own plugins (of type `Operation`)
    /**
     * key to register plugins for computation
     */
    export const opSymbol = Symbol('operations');
    /**
     * plugin type for `opSymbol`, expected by computation
     */
    export type Operation = (i: number) => number;
    /**
     * system context signature required by computation
     */
    export type Context = {
        [computation.opSymbol]: Operation
    };
    /**
     * messages API of computation
     */
    export namespace messages {
        export type ComputationRequest = { arg: number };
        export type Input = ComputationRequest;
    }
    /**
     * input for initializing computation
     */
    export type Props = {
        id: string;
    };
    /**
     * definition of the actor that provides computation
     */
    export const Actor = {
        address({id}: Props) {
            return `computation:${id}`
        },
        async create(ctx: ActorContext<messages.Input, Context>) {
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
}

function randomDelay() {
    return new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 45));
}

describe('system', () => {
    describe('stage 2 - plugin objects', () => {
        it(`2nd level plugins`, plan(1, async () => {
            const actorKey = 'theActor';
            type SystemOnlyContext = { [actorKey]: typeof computation.Actor; };

            type SystemContext = computation.Context & SystemOnlyContext;

            const p1: computation.Operation = (i: number) => i + 1;
            const p2: computation.Operation = (i: number) => i - 53;

            const system = createActorSystem<SystemContext>();

            system.log.subscribe(m => console.log(JSON.stringify(m)));
            system.set({key: actorKey, value: computation.Actor});
            system.set({key: computation.opSymbol, value: p1});
            system.set({key: computation.opSymbol, asyncFactory: () => randomDelay().then(()=> p2)});
            await system.run(async ctx => {
                const actor = await ctx.get(actorKey, Quantity.single);
                const firstProcessor = ctx.actorOf(actor, {id: 'first'});
                const request: computation.messages.ComputationRequest = {arg: 100};
                expect((await firstProcessor.ask(request)).body).to.eql(p2(p1(100)));
            });
        }));
    });
});

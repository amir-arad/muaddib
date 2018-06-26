import {createSystem, Quantity} from "../src";
import {expect, plan} from "test-kit";
import {Actor, Context, messages, Operation, opSymbol} from './computation'

function randomDelay() {
    return new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 45));
}

describe('system', () => {
    describe('stage 2 - plugin objects', () => {
        it(`2nd level plugins`, plan(1, async () => {
            const actorKey = 'theActor';
            type SystemOnlyContext = { [actorKey]: typeof Actor; };

            type SystemContext = Context & SystemOnlyContext;

            const p1: Operation = (i: number) => i + 1;
            const p2: Operation = (i: number) => i - 53;

            const system = createSystem<SystemContext>();

            // system.log.subscribe(m => console.log(JSON.stringify(m)));
            system.set({key: actorKey, value: Actor});
            system.set({key: opSymbol, value: p1});
            system.set({key: opSymbol, asyncFactory: () => randomDelay().then(() => p2)});
            await system.run(async ctx => {
                const actor = await ctx.get(actorKey, Quantity.single);
                const firstProcessor = ctx.actorOf(actor, {id: 'first'});
                const request: messages.ComputationRequest = {arg: 100};
                expect((await firstProcessor.ask(request)).body).to.eql(p2(p1(100)));
            });
        }));
    });
});

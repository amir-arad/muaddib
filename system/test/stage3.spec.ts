import {createActorSystem} from "../src";
import {expect, plan} from "./testkit/chai.spec";
import * as computation from './computation'

function randomDelay() {
    return new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 45));
}

describe('system', () => {
    describe('stage 3 - multiple vms', () => {
        it.only(`load plugins in different systems and have them all communicate with each other`, plan(1, async () => {
            type SystemContext = computation.Context;

            const p1: computation.Operation = (i: number) => i + 1;
            const p2: computation.Operation = (i: number) => i - 53;

            const serviceSystem = createActorSystem<SystemContext>();
            const consumerSystem = createActorSystem();

            serviceSystem.log.subscribe(m => console.log(JSON.stringify(m)));

            // TODO: connect system
            getConfig()

            // bootstrap service in serviceSystem
            serviceSystem.set({key: computation.opSymbol, value: p1});
            serviceSystem.set({key: computation.opSymbol, asyncFactory: () => randomDelay().then(() => p2)});
            await serviceSystem.run(async ctx => {
                ctx.actorOf(computation.Actor, {id: 'first'});
            });

            // consume service in consumerSystem
            await consumerSystem.run(async ctx => {
                const firstProcessorRemote = ctx.actorFor(computation.Actor.address({id: 'first'}));
                const request: computation.messages.ComputationRequest = {arg: 100};
                expect((await firstProcessorRemote.ask(request)).body).to.eql(p2(p1(100)));
            });

        }));
    });
});

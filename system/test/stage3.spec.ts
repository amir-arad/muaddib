import {ActorSystem, createActorSystem, SystemNetworkApi} from "../src";
import {expect, plan} from "./testkit/chai.spec";
import * as computation from './computation'
import {Channel} from "./simple-link.spec";
import {connect, ConnectionConfig} from "../../simple-link/src";

function randomDelay() {
    return new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 45));
}

async function connectSystem(system: ActorSystem<any>, connection: ConnectionConfig) {
    await system.connectTo(await connect<SystemNetworkApi>(connection, system.remoteApi));
}

describe('system', () => {
    describe('stage 3 - multiple vms', () => {
        it(`load plugins in different systems and have them all communicate with each other`, plan(1, async () => {
            type SystemContext = computation.Context;

            const p1: computation.Operation = (i: number) => i + 1;
            const p2: computation.Operation = (i: number) => i - 53;

            const serviceSystem = createActorSystem<SystemContext>();
            const consumerSystem = createActorSystem();

            // serviceSystem.log.subscribe(m => console.log(JSON.stringify(m)));
            // consumerSystem.log.subscribe(m => console.log(JSON.stringify(m)));

            const channel = new Channel('medium');

            // connect both systems
            await Promise.all([
                connectSystem(consumerSystem, channel.config1),
                connectSystem(serviceSystem, channel.config2)
            ]);

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

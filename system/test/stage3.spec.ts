import {createSystem} from "../src";
import {expect, plan} from "./testkit/chai.spec";
import * as computation from './computation';
import {Subject} from "rxjs";
import {connect, LinkMessage} from "../src/actors/system-link";

function randomDelay() {
    return new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 45));
}

class Channel {
    into1 = new Subject<LinkMessage>();
    into2 = new Subject<LinkMessage>();
    edge1 = {
        input: this.into1,
        output: this.into2
    };
    edge2 = {
        input: this.into2,
        output: this.into1
    };

    constructor() {
        // this.into1.subscribe(msg => {
        //     console.log('into1', msg);
        // });
        // this.into2.subscribe(msg => {
        //     console.log('into2', msg);
        // });
    }
}

describe('system', () => {
    describe('stage 3 - multiple vms', () => {
        type SystemContext = computation.Context;

        const p1: computation.Operation = (i: number) => i + 1;
        const p2: computation.Operation = (i: number) => i - 53;
        it(`load plugins in different systems that are connected to each other and have them communicate with each other`, plan(1, async () => {
            const serviceSystem = createSystem<SystemContext>();
            const consumerSystem = createSystem();

            // serviceSystem.log.subscribe(m => console.log(JSON.stringify(m)));
            // consumerSystem.log.subscribe(m => console.log(JSON.stringify(m)));

            const channel = new Channel();

            // connect both systems
            await Promise.all([
                connect(channel.edge1, consumerSystem.edge),
                connect(channel.edge2, serviceSystem.edge)
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
        it(`load plugins in different systems that are connected by proxies and have them all communicate with each other`, plan(1, async () => {
            // simulate a chain of systems with length=4
            // TODO: more complex graphs may create feedback infinite loops (unless each message carries with it its "notified edges" history.
            const serviceSystem = createSystem<SystemContext>('service'); // the system with the computation service
            const proxySystem1 = createSystem('proxy1'); // a system that is connected to the other systems
            const proxySystem2 = createSystem('proxy2'); // a system that is connected to the other systems
            const consumerSystem = createSystem('consumer'); // a system that needs to use the computation service

            // serviceSystem.log.subscribe(m => console.log(JSON.stringify(m)));
            // proxySystem.log.subscribe(m => console.log(JSON.stringify(m)));
            // consumerSystem.log.subscribe(m => console.log(JSON.stringify(m)));

            const channelA = new Channel();
            const channelB = new Channel();
            const channelC = new Channel();

            // connect all systems
            await Promise.all([
                // connect service to proxy1 via channelA
                connect(channelA.edge1, proxySystem1.edge),
                connect(channelA.edge2, serviceSystem.edge),
                // connect proxy1 to proxy2 via channelB
                connect(channelB.edge1, proxySystem1.edge),
                connect(channelB.edge2, proxySystem2.edge),
                // connect consumer to proxy2 via channelC
                connect(channelC.edge1, proxySystem2.edge),
                connect(channelC.edge2, consumerSystem.edge),
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

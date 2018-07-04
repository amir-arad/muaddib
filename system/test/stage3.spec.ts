import {ClusterMessage, ClusterNode, createSystem} from "../src";
import {expect, plan} from "test-kit";
import * as computation from './computation';
import {Subject} from "rxjs";

function randomDelay() {
    return new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 45));
}


describe('system', () => {
    describe('stage 3 - multiple "vms"', () => {

        /**
         *  same scenario as stage2 spec, only over cluster connection
         */
        async function testConnection(connectTwoNodes: (node1: ClusterNode, node2: ClusterNode) => any) {

            const p1: computation.Operation = (i: number) => i + 1;
            const p2: computation.Operation = (i: number) => i - 53;

            const serviceSystem = createSystem<computation.Context>();
            const consumerSystem = createSystem();
            // serviceSystem.log.subscribe(m => console.log(JSON.stringify(m)));
            // consumerSystem.log.subscribe(m => console.log(JSON.stringify(m)));
            await connectTwoNodes(consumerSystem.cluster, serviceSystem.cluster);

            // bootstrap service in serviceSystem
            serviceSystem.set({key: computation.opSymbol, value: p1});
            serviceSystem.set({key: computation.opSymbol, asyncFactory: () => randomDelay().then(() => p2)});
            await serviceSystem.run(async ctx => {
                ctx.actorOf(computation.Actor, {id: 'first'});
            });

            // consume service in consumerSystem
            await consumerSystem.run(async ctx => {
                // alternative to waitForActor would be to block on waitForHandshake for the systems to sync before asking forActor
                // const firstProcessorRemote = ctx.forActor(computation.Actor.address({id: 'first'}));
                const firstProcessorRemote = await ctx.actorWaitFor(computation.Actor.address({id: 'first'}));
                const request: computation.messages.ComputationRequest = {arg: 100};
                expect((await firstProcessorRemote.ask(request)).body).to.eql(p2(p1(100)));
            });
        }

        /**
         * build a simple cluster connection between two nodes
         */
        function connectTwoNodesDirectly(node1: ClusterNode, node2: ClusterNode) {
            // make a bi-directional connection (two streams)
            const stream1 = new Subject<ClusterMessage>();
            const stream2 = new Subject<ClusterMessage>();
            // connect the nodes crossover fashion (one's input is the other's output)
            node1.connect(stream1).subscribe(stream2);
            node2.connect(stream2).subscribe(stream1);
            // return promise that is waiting for HandshakeConfirm message on either stream, signaling that the connection is complete
            // instead of using actorWaitFor everywhere to solve bootstrap sync issues
            // return waitForHandshake(stream1, stream2);
        }

        it(`load plugins in different systems that are connected to each other and have them communicate with each other`, plan(1, async () => {
            await testConnection(connectTwoNodesDirectly);
        }));
        it(`load plugins in different systems that are connected by proxies and have them all communicate with each other`, plan(1, async () => {
            await testConnection((node1: ClusterNode, node2: ClusterNode) => {
                // simulate a "diamond of death" topology that may create feedback infinite loops if it wasn't for routes scanning
                const proxySystem1 = createSystem('proxy1'); // a system that is connected to node1, proxySystem2 and node2
                const proxySystem2 = createSystem('proxy2'); // a system that is connected to node1 and proxySystem1
                // connect all systems
                return Promise.all([
                    connectTwoNodesDirectly(proxySystem1.cluster, node2),
                    connectTwoNodesDirectly(proxySystem1.cluster, proxySystem2.cluster),
                    connectTwoNodesDirectly(proxySystem1.cluster, node1),
                    connectTwoNodesDirectly(proxySystem2.cluster, node1)
                ]);
            });
        }));
    });
});

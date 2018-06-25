import {createSystem, NetworkNode} from "../src";
import {expect, plan} from "./testkit/chai.spec";
import * as computation from './computation';
import {NextObserver, Observable, Subject} from "rxjs";
import {isMessageType, LinkMessage} from "../src/network";
import {filter, take} from 'rxjs/operators';

function randomDelay() {
    return new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 45));
}

class Channel {
    stream1 = new Subject<LinkMessage>();
    stream2 = new Subject<LinkMessage>();
}

function connect(toRemote: NextObserver<LinkMessage>, fromRemote: Observable<LinkMessage>, node: NetworkNode): Promise<any> {
    const output = node.connect(fromRemote);
    output.subscribe(toRemote);
    return output.pipe(filter(m => isMessageType('HandshakeConfirm', m)), take(1)).toPromise();
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
            await Promise.race([
                connect(channel.stream1, channel.stream2, consumerSystem.netNode),
                connect(channel.stream2, channel.stream1, serviceSystem.netNode)
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
                Promise.race([
                    // connect service to proxy1 via channelA
                    connect(channelA.stream1, channelA.stream2, proxySystem1.netNode),
                    connect(channelA.stream2, channelA.stream1, serviceSystem.netNode)
                ]), Promise.race([
                    // connect proxy1 to proxy2 via channelB
                    connect(channelB.stream1, channelB.stream2, proxySystem1.netNode),
                    connect(channelB.stream2, channelB.stream1, proxySystem2.netNode),
                ]), Promise.race([
                    // connect consumer to proxy2 via channelC
                    connect(channelC.stream1, channelC.stream2, proxySystem2.netNode),
                    connect(channelC.stream2, channelC.stream1, consumerSystem.netNode),
                ])
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

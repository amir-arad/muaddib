import {connect, ConnectionConfig, Endpoint, Messages, PartiaMessageEvent} from "../../simple-link/src";
import {Subject, Subscription} from "rxjs";
import {expect} from "chai";


class MessagePortImpl implements Endpoint {
    private readonly subscriptions = new WeakMap<Function, Subscription>();

    constructor(private input: Subject<PartiaMessageEvent>, private output: Subject<PartiaMessageEvent>) {

    }

    postMessage(data: Messages): void {
        this.output.next({data});
    }

    addEventListener(_: any, handler: (event: PartiaMessageEvent) => void): void {
        this.subscriptions.set(handler, this.input.subscribe(handler));
    }

    removeEventListener(_: any, listener: EventListenerOrEventListenerObject, options?: {}): void {
        const subscription = this.subscriptions.get(listener as any);
        subscription && subscription.unsubscribe();
    }
}

export class Channel {
    readonly port1: Endpoint;
    readonly config1: ConnectionConfig;
    readonly port2: Endpoint;
    readonly config2: ConnectionConfig;

    constructor(name:string) {
        const into1 = new Subject<PartiaMessageEvent>();
        const into2 = new Subject<PartiaMessageEvent>();
        this.port1 = new MessagePortImpl(into1, into2);
        this.port2 = new MessagePortImpl(into2, into1);
        this.config1 = {
            otherSideId: name + '2',
            thisSideId: name + '1',
            target: this.port1
        };
        this.config2 = {
            otherSideId: name + '1',
            thisSideId: name + '2',
            target: this.port2
        };
    }
}

describe('simple-link fake medium', ()=>{
    it('should allow calling methods both ways', async () => {
        const channel = new Channel('foo');

        const implA = {echo: (data: string) => Promise.resolve('echo A: ' + data)};
        const implB = {echo: (data: string) => Promise.resolve('echo B: ' + data)};
        const bsideAPI = connect<typeof implA>(channel.config1, implA);
        const asideAPI = await connect<typeof implB>(channel.config2, implB);

        expect(await (await bsideAPI).echo('daga')).to.equal('echo B: daga');
        expect(await asideAPI.echo('gaga')).to.equal('echo A: gaga');
    });
});

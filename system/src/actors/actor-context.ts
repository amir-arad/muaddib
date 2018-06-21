import {
    ActorContext,
    ActorDef,
    ActorRef,
    Address,
    ChildActorRef,
    Message,
    MessageAndContext,
    Serializable
} from "./types";
import {ActorSystemImpl} from "./actor-system";
import {Container} from "../dependencies/dependencies";
import {ActorRefImpl} from "./actor-reference";
import {Quantity} from "../dependencies/types";

export class ActorContextImpl<M, D> implements ActorContext<M, D> {
    private __message?: Message<M>;
    private __actorRefs: { [a: string]: ChildActorRef<any> } = {};
    private __jobCounter = 0;
    public replyTo?: ActorRef<any>;
    public readonly self: ActorRef<M>;

    constructor(private readonly system: ActorSystemImpl<any>, private readonly definition: ActorDef<any, M, D>, readonly address: Address, private readonly getImpl: Container<D>['get']) {
        this.self = this.makeBoundReference(this.address);
    }

    get<P extends keyof D>(key: P): Promise<D[P][]>;
    get<P extends keyof D>(key: P, quantity: Quantity.optional): Promise<D[P]>;
    get<P extends keyof D>(key: P, quantity: Quantity.single): Promise<D[P]>;
    get<P extends keyof D>(key: P, quantity: Quantity.any): Promise<Array<D[P]>>;
    async get<P extends keyof D>(key: P, quantity: Quantity = Quantity.any): Promise<null | D[P] | Array<D[P]>> {
        try {
            const result = await this.getImpl(key, quantity as any);
            const resultSize = result === null ? 0 : Array.isArray(result)? result.length : 1;
            this.system.log.next({type: 'ProvisioningSupplied', consumer: this.address, key : key.toString(), resultSize : resultSize, quantity : Quantity[quantity]});
            return result;
        } catch (error) {
            this.system.log.next({type: 'ProvisioningSupplyError', consumer: this.address, key : key.toString(), quantity : Quantity[quantity], error});
            throw error;
        }
    }

    async run(script: (ctx: ActorContext<never, D>) => any, address: Address = '' + this.__jobCounter++): Promise<void> {
        const newContext = new ActorContextImpl<never, D>(this.system, this.definition as any, this.address + '/run:' + address, this.getImpl);
        await script(newContext);
    }

    log(...args: any[]): void {
        this.system.log.next({type: 'LogEvent', source: this.address, message: args})
    }

    actorOf<P, M>(ctor: ActorDef<P, M, D>, props?: P): ChildActorRef<M> {
        return this.makeBoundReference(this.system.createActor<P, M>(ctor, props as P));
    }

    actorFor(addr: Address): ActorRef<any> {
        return this.makeBoundReference(addr);
    }

    unhandled(): void {
        if (this.__message) {
            this.system.unhandled(this.address, this.__message);
        } else {
            throw new Error('unexpected : unhandled() called outside of message scope');
        }
    }

    stop(): void {
        this.system.stopActor(this.address);
    }

    private makeBoundReference<M>(address: Address): ChildActorRef<M> {
        let result = this.__actorRefs[address];
        if (!result) {
            result = this.__actorRefs[address] = new ActorRefImpl(this.system, address, this);
        }
        return result;
    }

    /**
     * make an actor definitoin that will receive a response from another actor
     * this serves the `ask()` method of actor References
     * @param {Address} address the address of the actor to be defined
     * */
    makeReplyActor<T1 extends Serializable>(address: Address): ActorDef<void, T1, D> & { reply: Promise<MessageAndContext<T1>> } {
        let resolve: (m: MessageAndContext<T1>) => void;
        const reply = new Promise<MessageAndContext<T1>>((resolveArg) => {
            resolve = resolveArg;
        });
        return {
            reply,
            address,
            create: (askContext: ActorContextImpl<any, D>) => (body: T1) => {
                const message = askContext.__message;
                if (message) {
                    // the actor may be handling a different message when this one returns
                    resolve({
                        replyTo: askContext.replyTo && this.makeBoundReference(askContext.replyTo.address),
                        unhandled: () => this.system.unhandled(address, message),
                        body
                    });
                } else {
                    throw new Error('unexpected : askContext.__message is empty');
                }
            }
        };
    }

    startMessageScope(m: Message<M>) {
        this.__message = m;
        if (typeof m.replyTo === 'string') {
            this.replyTo = this.makeBoundReference(m.replyTo);
        }
    }

    stopMessageScope() {
        this.__message = undefined;
        this.replyTo = undefined;
    }
}

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
import {ActorSystemImpl, BaseActorRef} from "./actor-system";
import {DIContextImpl} from "./dependencies";

export class ActorContextImpl<M> implements ActorContext<M> {
    private __message?: Message<M>;
    private __jobCounter = 0;
    private __actorRefs = new WeakMap<BaseActorRef<any>, ChildActorRef<any>>();
    private diContext: DIContextImpl;
    public replyTo?: ActorRef<any>;
    public readonly self: ActorRef<M>;

    constructor(public readonly system: ActorSystemImpl, private readonly definition: ActorDef<any, any>, private readonly address: Address, private parent? : ActorContextImpl<any>) {
        this.self = this.makeBoundReference(this.address);
        this.diContext = new DIContextImpl(parent && parent.diContext);
    }

    resolve(key: string): Promise<null | any | any[]>{
        return this.diContext.resolve(key, this.definition);
    }

    bindValue(key: string, ctx: ActorDef<any, any>, value: any): void {
        this.diContext.bindValue(key, ctx, value);
    }

    log(...args: any[]): void {
        this.system.log.next({type: 'LogEvent', source: this.address, message: args})
    }

    actorOf<M>(ctor: ActorDef<void, M>): ChildActorRef<M>;
    actorOf<P, M>(ctor: ActorDef<P, M>, props: P): ChildActorRef<M>;
    actorOf<P, M>(ctor: ActorDef<P, M>, props?: P): ChildActorRef<M> {
        return this.makeBoundReference(this.system.createActor<P, M>(ctor, props as P, this));
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
        const baseRef: BaseActorRef<M> = this.system.getBaseActorRef(address);
        if (this.__actorRefs.has(baseRef)) {
            return this.__actorRefs.get(baseRef)!;
        } else {
            const boundRef = Object.create(baseRef) as ChildActorRef<M>;
            boundRef.send = (body: M, replyTo?: ActorRef<any>) => this.system.sendMessage({
                to: baseRef.address,
                body,
                replyTo: replyTo && replyTo.address
            });
            boundRef.ask = (body: M, options?: { id?: string; timeout?: number }) => this.__ask(baseRef.address, body, options);
            this.__actorRefs.set(baseRef, boundRef);
            return boundRef;
        }
    }

    private __ask<T1 extends Serializable>(to: Address, reqBody: T1, options?: { id?: string; timeout?: number }): Promise<MessageAndContext<any>> {
        // the actor may be handling a different message when this one returns
        return new Promise<MessageAndContext<any>>(async (resolve, reject) => {
            // time out the entire operation
            const timeout = setTimeout(() => {
                replyActorRef.stop();
                reject(new Error('request timed out : ' + JSON.stringify(reqBody)));
            }, options && options.timeout || 1000);
            // make an actor that will receive the reply
            const replyAddress = this.address + '/asking:' + to + '/' + (options && options.id || this.__jobCounter++);
            const replyActorRef = await this.actorOf({
                address: replyAddress,
                create: (askContext: ActorContextImpl<any>) => (body: M) => {
                    const message = askContext.__message;
                    if (message) {
                        resolve({
                            replyTo: askContext.replyTo && this.makeBoundReference(askContext.replyTo.address),
                            unhandled: () => this.system.unhandled(replyAddress, message),
                            body
                        });
                        clearTimeout(timeout);
                        replyActorRef.stop();
                    } else {
                        throw new Error('unexpected : askContext.__message is empty');
                    }
                }
            });
            // send the request with custom replyTo
            this.system.sendMessage({to, body: reqBody, replyTo: replyActorRef.address});
        });
    }

    __startMessageScope(m: Message<M>) {
        this.__message = m;
        if (typeof m.replyTo === 'string') {
            this.replyTo = this.makeBoundReference(m.replyTo);
        }
    }

    __stopMessageScope() {
        this.__message = undefined;
        this.replyTo = undefined;
    }
}

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


export class ActorContextImpl<M> implements ActorContext<M> {
    private __message?: Message<M>;
    private __jobCounter = 0;

    replyTo?: ActorRef<any>;
    readonly self: ActorRef<M>;
    readonly log = {
        log: (...args: any[]): void => this.system.log.next({type: 'LogEvent', source: this.address, message: args})
    };

    constructor(public readonly system: ActorSystemImpl, private readonly address: Address) {
        this.self = system.getActorRef(this.address);
    }

    actorOf<M>(ctor: ActorDef<void, M>): ChildActorRef<M>;
    actorOf<P, M>(ctor: ActorDef<P, M>, props: P): ChildActorRef<M>;
    actorOf<P, M>(ctor: ActorDef<P, M>, props?: P): ChildActorRef<M> {
        return this.system.createActor<P, M>(ctor, props as P);
    }

    actorFor(addr: Address): ActorRef<any> {
        return this.system.getActorRef(addr);
    }

    ask<T1 extends Serializable>(to: ActorRef<T1>, reqBody: T1, options?: { id?: string; timeout?: number }): Promise<MessageAndContext<any>> {
        // the actor may be handling a different message when this one returns
        return new Promise<MessageAndContext<any>>(async (resolve, reject) => {
            // time out the entire operation
            const timeout = setTimeout(() => {
                replyActorRef.stop();
                reject(new Error('request timed out : ' + JSON.stringify(reqBody)));
            }, options && options.timeout || 1000);
            // make an actor that will receive the reply
            const replyAddress = this.address + '/asking:' + (options && options.id || this.__jobCounter++);
            const replyActorRef = await this.actorOf({
                address: replyAddress,
                create: (askContext: ActorContextImpl<any>) => (body: M) => {
                    const message = askContext.__message;
                    if (message) {
                        resolve({
                            replyTo: askContext.replyTo,
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
            this.system.send(to, reqBody, replyActorRef);
        });
    }

    send<T1 extends Serializable>(to: ActorRef<T1>, body: T1, replyTo?: ActorRef<any>): void {
        this.system.sendMessage({to: to.address, body, replyTo: replyTo && replyTo.address});
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

    __startMessageScope(m: Message<M>) {
        this.__message = m;
        if (typeof m.replyTo === 'string') {
            this.replyTo = this.system.getActorRef(m.replyTo);
        }
    }

    __stopMessageScope() {
        this.__message = undefined;
        this.replyTo = undefined;
    }
}

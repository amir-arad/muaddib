import {Address} from "../types";
import {SystemImpl} from "../system";
import {ActorContextImpl, MessageAndContext} from "./context";

export interface ActorRef<T> {
    address: Address;

    send(body: T, replyTo?: ActorRef<any>): void;

    ask(body: T, options?: { id?: string, timeout?: number }): Promise<MessageAndContext<any>>;
}

export interface ChildActorRef<T> extends ActorRef<T> {
    stop(): void;
}

export class ActorRefImpl<T> implements ChildActorRef<T> {
    private __jobCounter = 0;

    constructor(private system: SystemImpl<any>, public address: Address, private ctx: ActorContextImpl<any, any>) {
    }

    send(body: T, replyTo?: ActorRef<any>): void {
        this.system.sendMessage({
            to: this.address,
            body,
            replyTo: replyTo && replyTo.address
        });
    }

    async ask(body: T, options?: { id?: string, timeout?: number }): Promise<MessageAndContext<any>> {
        // make an actor definition that will receive the reply
        const replyActorDef = this.ctx.makeReplyActor(this.ctx.address + '/asking:' + this.address + '/' + (options && options.id || this.__jobCounter++));
        const replyActorRef = this.ctx.actorOf(replyActorDef);
        const timeoutPromise = new Promise((resolve) => {
            setTimeout(resolve, options && options.timeout || 1000)
        }).then(() => {
            throw new Error('request timed out : ' + JSON.stringify(body));
        });
        try {
            // send the request with custom replyTo
            this.system.sendMessage({to: this.address, body, replyTo: replyActorRef.address});
            return await Promise.race([
                replyActorDef.reply,
                timeoutPromise
            ]);
        } finally {
            replyActorRef.stop();
        }
    }

    stop(): void {
        (this.system as any).stopActor(this.address);
    }
}

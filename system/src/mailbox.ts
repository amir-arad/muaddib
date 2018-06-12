import {ActorContext, ActorRef, Serializable} from "./types";
import {ActorSystem} from "./index";
import {Observable, Subject} from "rxjs";

/**
 * utility class for communicating with actors in the system
 */
export class Mailbox {
    private static counter = 0;

    public readonly incoming: Observable<Serializable>;
    private readonly ctx!: ActorContext<Serializable>;

    constructor(system: ActorSystem, id?: string) {
        const incoming = new Subject<Serializable>();
        const address = id || 'Mailbox:' + (Mailbox.counter++);
        this.incoming = incoming;
        system.actorOf({
            address,
            create: ctx => {
                (this as any).ctx = ctx;
                return (msg: Serializable) => incoming.next(msg);
            }
        });
    }

    async ask<T1 extends Serializable>(to: ActorRef<T1>, body: T1, options?: { id?: string, timeout?: number }): Promise<Serializable> {
        return (await this.ctx.ask(to, body, options)).body;
    }
}

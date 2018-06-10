import {Actor, ActorContext, ActorRef, Address, Message, Serializable} from "./types";
import {System} from "./index";
import {first} from 'rxjs/operators';
import {Observable, Subject} from "rxjs";

/**
 * utility actor class for communicating with actors in the system
 */
export class Mailbox {
    private static counter = 0;

    public readonly incoming: Observable<Serializable>;
    public send: (to: Address, body: Serializable) => void;
    public address: Address;

    constructor(system: System, id?: string) {
        const incoming = new Subject<Serializable>();
        this.address = id || 'Mailbox:' + (Mailbox.counter++);
        this.incoming = incoming;//.pipe(delay(0));
        const self = system.actorFor(this.address);
        this.send = <T extends Serializable>(to: Address | ActorRef<T>, body: T) => system.send(to, body, self);
        system.actorOf(MailboxActor, {address: this.address, incoming});
    }

    /**
     * catch the next message that will arrive at the mailbox
     * @returns {Promise<any>}
     */
    getNext() {
        return this.incoming.pipe(first()).toPromise();
    }

    // TODO: remove the default `any` result type
    ask(to: Address, body: Serializable, resMatcher?: (m: any) => boolean): Promise<any>;
    ask<R extends Serializable>(to: Address, body: Serializable, resMatcher?: (m: any) => m is R): Promise<R>;
    ask(to: Address, body: Serializable, resMatcher?: (m: Serializable) => boolean): Promise<Serializable> {
        const res = this.incoming.pipe(first(resMatcher)).toPromise();
        this.send(to, body);
        return res;
    }
}

class MailboxActor<M extends Serializable> implements Actor<M> {
    static address(p: { address: Address }) {
        return p.address;
    }

    private incoming: Subject<M>;

    constructor(public ctx: ActorContext<M>, p: { incoming: Subject<M> }) {
        this.incoming = p.incoming;
    }

    onReceive(message: M) {
        this.incoming.next(message);
    }
}

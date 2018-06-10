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
    public send: <T extends Serializable>(to: ActorRef<T>, body: T) => void;

    constructor(system: System, id?: string) {
        const incoming = new Subject<Serializable>();
        const address = id || 'Mailbox:' + (Mailbox.counter++);
        this.incoming = incoming;//.pipe(delay(0));
        const self = system.actorFor(address);
        this.send = <T extends Serializable>(to: ActorRef<T>, body: T) => system.send(to, body, self);
        system.actorOf(MailboxActor, {address, incoming});
    }

    /**
     * catch the next message that will arrive at the mailbox
     * @returns {Promise<any>}
     */
    getNext() {
        return this.incoming.pipe(first()).toPromise();
    }

    // TODO: remove the default `any` result type
    ask<T extends Serializable>(to: ActorRef<T>, body: T, resMatcher?: (m: any) => boolean): Promise<any>;
    ask<T extends Serializable, R extends Serializable>(to: ActorRef<T>, body: T, resMatcher?: (m: any) => m is R): Promise<R>;
    ask<T extends Serializable>(to: ActorRef<T>, body: T, resMatcher?: (m: Serializable) => boolean): Promise<Serializable> {
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
// having a Subject as a property couples this actor to the local VM of the Mailbox that created it
    constructor(public ctx: ActorContext<M>, p: { incoming: Subject<M> }) {
        this.incoming = p.incoming;
    }

    onReceive(message: M) {
        this.incoming.next(message);
    }
}

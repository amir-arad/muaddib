import {Actor, ActorContext, Address, Message, Serializable} from "./types";
import {System} from "./index";
import {first} from 'rxjs/operators';
import {Observable, Subject} from "rxjs";

/**
 * utility actor class for communicating with actors in the system
 */
export class Mailbox {
    private static counter = 0;

    public readonly incoming: Observable<Message<any>>;
    public send: (to: Address, body: Serializable) => void;
    public address: Address;

    constructor(system: System, id?: string) {
        const incoming = new Subject<Message<any>>();
        this.address = id || 'Mailbox:' + (Mailbox.counter++);
        this.incoming = incoming;//.pipe(delay(0));
        this.send = (to: Address, body: Serializable) => (system as any).sendMessage({to, body, from: this.address});
        system.actorOf(MailboxActor, {address: this.address, incoming});
    }

    /**
     * catch the next message that will arrive at the mailbox
     * @returns {Promise<any>}
     */
    getNext() {
        return this.incoming.pipe(first()).toPromise();
    }

    reqRes<R extends Message<any>>(to: Address, body: Serializable, resMatcher?: (m: Message<any>) => boolean): Promise<R> {
        const res = this.incoming.pipe(first(resMatcher)).toPromise() as Promise<R>;
        this.send(to, body);
        return res;
    }
}

class MailboxActor implements Actor<any> {
    static address(p: { address: Address }) {
        return p.address;
    }

    private incoming: Subject<Message<any>>;

    constructor(public ctx: ActorContext, p: { incoming: Subject<Message<any>> }) {
        this.incoming = p.incoming;
    }

    onReceive(message: Message<any>) {
        this.incoming.next(message);
    }
}

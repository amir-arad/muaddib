import {filter, delay} from 'rxjs/operators';
import {Subject} from "rxjs";


// TODO dont use state in module, make an actorSystem class with its internal bus
const messageBus = new Subject<Message<any>>();

export type Address = string;

export interface Serializable {

}

export interface Message<T extends Serializable> {
    from?: Address;
    to: Address;
    body: T;
}

export abstract class Actor<M extends Serializable> {

    static send(to: Address, body: Serializable) {
        messageBus.next({to, body});
    }

    constructor(public readonly address: Address) {
        (async () => {
        //    await this.init();
            messageBus
                .pipe(filter(m => m.to === address), delay(0)) // TODO: move delay to either the bus or custom test actor operators
                // TODO use scheduler to have actor only handle one message at any given time
                // TODO allow actor to add custom rxjs operators
                .subscribe((m: Message<M>) => this.onReceive(m))
        })();
    }

    // protected init(): void | Promise<void> {}

    protected unhandled(message: Message<M>) {
        // TODO notify supervisior
        console.error('unhandled message', JSON.stringify(message));
    }

    protected send(to: Address, body: Serializable) {
        messageBus.next({to, body, from: this.address});
    }

    protected abstract onReceive(message: Message<M>): void | Promise<void>;
}

/**
 * utility actor class for communicating with actors in the system
 */
export class Mailbox extends Actor<any> {
    public readonly incoming = new Subject<Message<any>>();

    protected onReceive(message: Message<any>): void | Promise<void> {
        this.incoming.next(message);
    }

    // override send just to make it public
    public send(to: Address, body: Serializable) {
        super.send(to, body);
    }
}

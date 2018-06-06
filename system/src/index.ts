import {filter, map} from 'rxjs/operators';
import {OperatorFunction, Subject} from "rxjs";
import {Serializable} from "simple-link/dist/src/serializeable";

const mailbox = new Subject<Message>();

const noopArray: OperatorFunction<any, any>[] = [];

export type Address = string;

export interface Message {
    from?: Address;
    to: Address;
    body: Serializable;
}

export abstract class Actor<M extends Serializable> {

    static send(to: Address, body: Serializable) {
        mailbox.next({to, body});
    }

    protected constructor(public readonly address: Address, mailboxOperations: OperatorFunction<M, M>[] = noopArray) {
        (async () => {
            await this.init();
            mailbox
                .pipe(filter(m => m.to === address), map((m: Message) => m.body as M))
                .pipe(...(mailboxOperations))
                .subscribe(this.handle.bind(this)) // TODO use scheduler to have actor only handle one message at any given time
        })();
    }

    protected init(): void | Promise<void> {
    }

    protected send(to: Address, body: Serializable) {
        mailbox.next({to, body, from: this.address});
    }

    protected abstract handle(message: M, sender?: Address): void | Promise<void>;
}



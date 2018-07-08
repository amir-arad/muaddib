import {Address, isPromiseLike, Message} from "../types";
import {ActorContextImpl} from "./context";
import {flatMap} from 'rxjs/operators';
import {Subject} from "rxjs";
import {Actor, ActorDef, isActorFactory} from "./definition";

const emptyArr: any[] = [];

export class ActorManager<P, M> {
    private readonly inbox = new Subject<Message<M>>();

    constructor(private context: ActorContextImpl<M, any>, definition: ActorDef<P, M, any>, address: Address, props: P) {
        const actor = (isActorFactory(definition) ? definition.create(this.context, props) : new definition(this.context, props));
        if (isPromiseLike(actor)) {
            this.initActorAsync(actor);
        } else {
            this.initActorSync(actor);
        }
    }

    private initActorAsync(actor: Promise<Actor<M>>) {
        const meanwhile: Array<Message<M>> = [];
        const meanwhileSubscription = this.inbox.subscribe(m => {
            meanwhile.push(m);
        });
        actor.then(a => {
            this.initActorSync(a);
            meanwhileSubscription.unsubscribe();
            meanwhile.forEach(m => this.inbox.next(m));
        });
    }

    private initActorSync(actor: Actor<M>) {
        // TODO : allow actor to add custom rxjs operators for its mailbox
        const actorHandleMessage = async (m: Message<M>) => {
            try {
                this.context.startMessageScope(m);
                const actorResult = typeof actor === 'function' ? actor(m.body) : actor.onReceive(m.body);
                await actorResult;
                return emptyArr;
            } finally {
                this.context.stopMessageScope();
            }
        };
        this.inbox.pipe(flatMap(actorHandleMessage, 1 /* one message at a time */)).subscribe();
        // TODO : startup hook on actor object
    }

    sendMessage(message: Message<M>) {
        this.inbox.next(message);
    }

    stop() {
        // TODO : shutdown hook on actor object
        this.inbox.complete();
    }
}

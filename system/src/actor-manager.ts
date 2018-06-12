import {Actor, ActorDef, Address, isActorFactory, isPromiseLike, Message} from "./types";
import {ActorSystemImpl} from "./actor-system";
import {ActorContextImpl} from "./actor-context";
import {flatMap} from 'rxjs/operators';
import {Subject} from "rxjs";

const emptyArr: any[] = [];

export class ActorManager<P, M> {
    private readonly inbox = new Subject<Message<M>>();
    private readonly context: ActorContextImpl<M>;

    constructor(ctor: ActorDef<P, M>, address: Address, props: P, system: ActorSystemImpl) {
        this.context = new ActorContextImpl(system, address);
        const actor = (isActorFactory(ctor) ? ctor.create(this.context, props) : new ctor(this.context, props));
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
        // TODO allow actor to add custom rxjs operators for its mailbox
        const actorHandleMessage = async (m: Message<M>) => {
            try {
                this.context.__startMessageScope(m);
                const actorResult = typeof actor === 'function' ? actor(m.body) : actor.onReceive(m.body);
                await actorResult;
                return emptyArr;
            } finally {
                this.context.__stopMessageScope();
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

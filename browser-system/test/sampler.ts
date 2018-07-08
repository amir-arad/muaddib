import {ActorContext, ActorObject, System} from "system";
import {createSystem} from "system";

declare global {
    interface Window {
        __testValue: string;
    }
}

export interface Test {
    type: 'Test';
}

export class Sampler implements ActorObject<Test> {
    static address = 'sampler';

    constructor(private ctx: ActorContext<Test, {}>) {
        window.__testValue = 'foo';
    }

    onReceive(msg: Test) {
        if (msg.type === 'Test' && this.ctx.replyTo) {
            this.ctx.replyTo.send({type: 'Sample', value: window.__testValue});
        } else {
            this.ctx.unhandled();
        }
    }
}

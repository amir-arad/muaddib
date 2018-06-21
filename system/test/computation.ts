import {ActorContext, Quantity} from "../src";

// this is a feature plugin module
// with its own plugins (of type `Operation`)

/**
 * key to register plugins for computation
 */
export const opSymbol = Symbol('operations');
/**
 * plugin type for `opSymbol`, expected by computation
 */
export type Operation = (i: number) => number;
/**
 * system context signature required by computation
 */
export type Context = {
    [opSymbol]: Operation
};
/**
 * messages API of computation
 */
export namespace messages {
    export type ComputationRequest = { arg: number };
    export type Input = ComputationRequest;
}
/**
 * input for initializing computation
 */
export type Props = {
    id: string;
};
/**
 * definition of the actor that provides computation
 */
export const Actor = {
    address({id}: Props) {
        return `computation:${id}`
    },
    async create(ctx: ActorContext<messages.Input, Context>) {
        const plugins = await ctx.get(opSymbol, Quantity.any);
        return (msg: messages.ComputationRequest) => {
            if (ctx.replyTo) {
                const result = plugins.reduce((v, o) => o(v), msg.arg);
                ctx.replyTo.send(result);
            } else {
                ctx.unhandled();
            }
        }
    }
};

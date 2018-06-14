import {ActorDef, BindContext} from "./types";

type Proivider = {
    type: 'value';
    value: any;
}

// TODO: internally make it a plugguble "aspect" of the actor system
export class DIContextImpl implements BindContext {
    private __actorRefs = new WeakMap<object, Map<string, Set<Proivider>>>();

    constructor(private parent?: DIContextImpl) {

    }

    bindValue(key: string, ctx: object, value: any): void {
        this.bind(key, ctx, {type: 'value', value})
    }

    // todo rename ctx
    // todo optional ctx (global ctx)
    private bind(key: string, ctx: object, provider: Proivider): void {
        let bindingContext = this.__actorRefs.get(ctx);
        if (!bindingContext) {
            bindingContext = new Map();
            this.__actorRefs.set(ctx, bindingContext);
        }
        let bindingBucket = bindingContext.get(key);
        if (!bindingBucket) {
            bindingBucket = new Set();
            bindingContext.set(key, bindingBucket);
        }
        bindingBucket.add(provider);
    }

    private resolveProvider = (provider: Proivider) => {
        switch (provider.type) {
            case 'value' :
                return provider.value;
            default :
                throw new Error(`unknown provider type: ${provider.type}`);
        }
    };

    // todo quantifier
    // todo rename ctx
    async resolve(key: string, ctx: ActorDef<any, any>): Promise<null | any | any[]> {
        let bindingContext = this.__actorRefs.get(ctx);
        if (!bindingContext) {
            if (this.parent) {
                return this.parent.resolve(key, ctx);
            } else {
                return null;
            }
        }
        let bindingBucket = bindingContext.get(key);
        if (bindingBucket) {
            switch (bindingBucket.size) {
                case 0 :
                    return null;
                case 1 :
                    return await this.resolveProvider(bindingBucket.values().next().value);
                default :
                    return await Promise.all(Array.from(bindingBucket).map(this.resolveProvider));
            }
        } else {
            if (this.parent) {
                return this.parent.resolve(key, ctx);
            } else {
                return null;
            }
        }
    }
}

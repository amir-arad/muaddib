import {
    AnyProvisioning,
    BindContext,
    isAsyncFactoryProvisioning,
    isValueProvisioning,
    ProvisioningPath,
    Quantity,
    ResolveContext
} from "./types";

type Awaitable<T> = Promise<T> | T;
type Resolver<T> = <T1 extends keyof T>(key: T1, target: object) => Array<Awaitable<T[T1]>>;

const globalTarget = {};
const emptyResolver = () => [];

// TODO: handle singleton scope
export class Container<T> implements BindContext<T>, ResolveContext<T> {
    private readonly provisioning = new WeakMap<object, Map<keyof T, Set<AnyProvisioning<T[keyof T]>>>>();

    resolve: Resolver<T> = <T1 extends keyof T>(key: T1, target: object) => {
        const result = this.superResolve<T1>(key, target) as Array<Awaitable<T[T1]>>;
        this.resolveByContext(key, globalTarget, result);
        this.resolveByContext(key, target, result);
        return result;
    };

    constructor(private providerContext: object, private superResolve: Resolver<T> = emptyResolver) {

    }

    set<P extends keyof T>(provisioning: ProvisioningPath<P> & AnyProvisioning<T[P]>): void {
        const target = provisioning.target || globalTarget;
        let bindingContext = this.provisioning.get(target);
        if (!bindingContext) {
            bindingContext = new Map();
            this.provisioning.set(target, bindingContext);
        }
        let bindingBucket = bindingContext.get(provisioning.key);
        if (!bindingBucket) {
            bindingBucket = new Set();
            bindingContext.set(provisioning.key, bindingBucket);
        }
        bindingBucket.add(provisioning);
    }

    get<T1 extends keyof T>(key: T1): Promise<T[T1][]>;
    get<T1 extends keyof T>(key: T1, quantity: Quantity.optional): Promise<T[T1]>;
    get<T1 extends keyof T>(key: T1, quantity: Quantity.single): Promise<T[T1]>;
    get<T1 extends keyof T>(key: T1, quantity: Quantity.any): Promise<Array<T[T1]>>;
    async get<T1 extends keyof T>(key: T1, quantity: Quantity = Quantity.any): Promise<null | T[T1] | Array<T[T1]>> {
        const result = this.resolve(key, this.providerContext);
        if (quantity === Quantity.any) {
            return await Promise.all(result);
        } else if (result.length > 1) {
            throw new Error(`Ambiguity: found ${result.length} matches for ${key}`);
        } else if (result.length === 1) {
            return await result[0];
        } else if (quantity === Quantity.single) {
            throw new Error(`Not found: ${key}`);
        } else {
            return null;
        }
    }

    private resolveProvider = <T1 extends T[keyof T]>(provider: AnyProvisioning<T1>) => {
        if (isValueProvisioning(provider)) {
            return provider.value;
        } else if (isAsyncFactoryProvisioning(provider)) {
            return provider.asyncFactory();
        } else {
            throw new Error(`unknown provider: ${JSON.stringify(provider)}`);
        }
    };

    private resolveByContext<T1 extends keyof T>(key: T1, target: object, accumulator: Array<Awaitable<T[T1]>>) {
        let bindingContext = this.provisioning.get(target);
        if (bindingContext) {
            let bindingBucket = bindingContext.get(key) as Set<AnyProvisioning<T[T1]>> | undefined;
            if (bindingBucket) {
                accumulator.push(...Array.from(bindingBucket).map(this.resolveProvider));
            }
        }
    }
}

import {
    AnyProvisioning,
    Awaitable,
    BindContext,
    isAsyncFactoryProvisioning,
    isValueProvisioning,
    ProvisioningPath,
    Quantity,
    ResolveContext
} from "./types";

function resolveProvider<T>(provider: AnyProvisioning<T>): Awaitable<T> {
    if (isValueProvisioning(provider)) {
        return provider.value;
    } else if (isAsyncFactoryProvisioning(provider)) {
        return provider.asyncFactory();
    } else {
        throw new Error(`unknown provider: ${JSON.stringify(provider)}`);
    }
}

// TODO: implement singleton scope
export class Container<T> implements BindContext<T>, ResolveContext<T> {
    private readonly provisioning = new Map<keyof T, Set<AnyProvisioning<T[keyof T]>>>();

    set<P extends keyof T>(provisioning: ProvisioningPath<P> & AnyProvisioning<T[P]>): void {
        let bindingBucket = this.provisioning.get(provisioning.key);
        if (!bindingBucket) {
            bindingBucket = new Set();
            this.provisioning.set(provisioning.key, bindingBucket);
        }
        bindingBucket.add(provisioning);
    }

    get<T1 extends keyof T>(key: T1): Promise<T[T1][]>;
    get<T1 extends keyof T>(key: T1, quantity: Quantity.optional): Promise<T[T1]>;
    get<T1 extends keyof T>(key: T1, quantity: Quantity.single): Promise<T[T1]>;
    get<T1 extends keyof T>(key: T1, quantity: Quantity.any): Promise<Array<T[T1]>>;
    async get<T1 extends keyof T>(key: T1, quantity: Quantity = Quantity.any): Promise<null | T[T1] | Array<T[T1]>> {
        let result: Array<Awaitable<T[T1]>>;
        let bindingBucket = this.provisioning.get(key) as Set<AnyProvisioning<T[T1]>> | undefined;
        if (bindingBucket) {
            result = Array.from(bindingBucket).map(resolveProvider);
        } else {
            result = [];
        }
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
}

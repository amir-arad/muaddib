export type Index = string | symbol | number;

export enum Quantity {optional, single, any}

export enum ProviderScope {
    'singleton', // The same instance will be returned for each request
    'template' // A new instance of the type will be created each time one is requested
}

export type ProvisioningPath<K = Index> = {
    key: K;
}

export type DependencyProvisioning = {
    scope?: ProviderScope;
} & ProvisioningPath;

export function isValueProvisioning<T>(p: AnyProvisioning<T>): p is ValueProvisioning<T> {
    return 'value' in p;
}

export type ValueProvisioning<T> = DependencyProvisioning & {
    value: T;
    scope?: 'singleton'
}

export type AsyncFactoryProvisioning<T> = DependencyProvisioning & {
    asyncFactory: () => Promise<T>;
}

export function isAsyncFactoryProvisioning<T>(p: AnyProvisioning<T>): p is AsyncFactoryProvisioning<T> {
    return 'asyncFactory' in p;
}

export type AnyProvisioning<T> = ValueProvisioning<T> | AsyncFactoryProvisioning<T>;

export interface BindContext<T> {
    /**
     * define a provisioning of dependencies
     */
    set<T1 extends keyof T>(value: ProvisioningPath<T1> & ValueProvisioning<T[T1]>): void;

    set<T1 extends keyof T>(asyncFactory: ProvisioningPath<T1> & AsyncFactoryProvisioning<T[T1]>): void;

    // reset(provisioning: DependencyProvisioning): void;
}

export interface ResolveContext<T> {
    get<T1 extends keyof T>(key: T1): Promise<Array<T[T1]>>;

    get<T1 extends keyof T>(key: T1, quantity: Quantity.optional): Promise<T[T1]>;

    get<T1 extends keyof T>(key: T1, quantity: Quantity.single): Promise<T[T1]>;

    get<T1 extends keyof T>(key: T1, quantity: Quantity.any): Promise<Array<T[T1]>>;
}

export type Awaitable<T> = Promise<T> | T;

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
    private readonly registry = new Map<keyof T, Set<AnyProvisioning<T[keyof T]>>>();

    constructor() {
        // todo: move it to "get" field declaration
        this.get = this.get.bind(this);
    }

    set<P extends keyof T>(provisioning: ProvisioningPath<P> & AnyProvisioning<T[P]>): void {
        let bindingBucket = this.registry.get(provisioning.key);
        if (!bindingBucket) {
            bindingBucket = new Set();
            this.registry.set(provisioning.key, bindingBucket);
        }
        bindingBucket.add(provisioning);
    }

    get<T1 extends keyof T>(key: T1): Promise<T[T1][]>;
    get<T1 extends keyof T>(key: T1, quantity: Quantity.optional): Promise<T[T1]>;
    get<T1 extends keyof T>(key: T1, quantity: Quantity.single): Promise<T[T1]>;
    get<T1 extends keyof T>(key: T1, quantity: Quantity.any): Promise<Array<T[T1]>>;
    async get<T1 extends keyof T>(key: T1, quantity: Quantity = Quantity.any): Promise<null | T[T1] | Array<T[T1]>> {
        let result: Array<Awaitable<T[T1]>>;
        let bindingBucket = this.registry.get(key) as Set<AnyProvisioning<T[T1]>> | undefined;
        if (bindingBucket) {
            result = Array.from(bindingBucket).map(resolveProvider);
        } else {
            result = [];
        }
        if (quantity === Quantity.any) {
            return await Promise.all(result);
        } else if (result.length > 1) {
            throw new Error(`Ambiguity: found ${result.length} matches for ${key.toString()}`);
        } else if (result.length === 1) {
            return await result[0];
        } else if (quantity === Quantity.single) {
            throw new Error(`Not found: ${key.toString()}`);
        } else {
            return null;
        }
    }
}

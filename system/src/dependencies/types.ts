export type Index = string | symbol;

export enum Quantity {optional, single, any}

export enum ProviderScope {
    'singleton', // The same instance will be returned for each request
    'template' // A new instance of the type will be created each time one is requested
}

export type ProvisioningPath<K = Index> = {
    key: K;
    target?: object;
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
    get<T1 extends keyof T>(key: T1): Promise<T[T1][]>;

    get<T1 extends keyof T>(key: T1, quantity: Quantity.optional): Promise<T[T1]>;

    get<T1 extends keyof T>(key: T1, quantity: Quantity.single): Promise<T[T1]>;

    get<T1 extends keyof T>(key: T1, quantity: Quantity.any): Promise<Array<T[T1]>>;
}

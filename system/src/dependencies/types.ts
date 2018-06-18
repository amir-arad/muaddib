
export enum Quantity {'optional', 'single', 'any'};

export enum ProviderScope {
    'singleton', // The same instance will be returned for each request
    'template' // A new instance of the type will be created each time one is requested
}

export type ProvisioningPath = {
    key: string;
    target?: object;
}

export type DependencyProvisioning = {
    scope?: ProviderScope;
} & ProvisioningPath;

export function isValueProvisioning(p: AnyProvisioning): p is ValueProvisioning{
    return 'value' in p;
}
export type ValueProvisioning = DependencyProvisioning & {
    value: any;
    scope?: 'singleton'
}

export type AsyncFactoryProvisioning = DependencyProvisioning & {
    asyncFactory: () => Promise<any>;
}

export function isAsyncFactoryProvisioning(p: AnyProvisioning): p is AsyncFactoryProvisioning{
    return 'asyncFactory' in p;
}

export type AnyProvisioning = ValueProvisioning | AsyncFactoryProvisioning;
export interface BindContext {
    /**
     * ignore previously set values on self and parents
     * @param {ProvisioningPath} path what to ignore
     */
    clear(path: ProvisioningPath): void;

    /**
     * define a provisioning of dependencies
     */
    set(value: ValueProvisioning): void;
    set(asyncFactory: AsyncFactoryProvisioning): void;

    // reset(provisioning: DependencyProvisioning): void;
}

export interface ResolveContext {
    get<T>(key: string): Promise<T[]>;

    get<T>(key: string, quantity: Quantity.optional): Promise<T>;

    get<T>(key: string, quantity: Quantity.single): Promise<T>;

    get<T>(key: string, quantity: Quantity.any): Promise<Array<T>>;
}

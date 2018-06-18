import {
    AnyProvisioning,
    AsyncFactoryProvisioning,
    BindContext,
    isAsyncFactoryProvisioning,
    isValueProvisioning,
    ProvisioningPath,
    Quantity,
    ResolveContext,
    ValueProvisioning
} from "./types";

const globalTarget = {};

// TODO: handle singleton scope
export class Container<T> implements BindContext<T>, ResolveContext<T> {
    private provisioning = new WeakMap<object, Map<string, Set<AnyProvisioning<T[keyof T]>>>>();
    private noPropagation = new WeakMap<object, Set<string>>();

    constructor(private providerContext: object, private parent?: Container<T>) {

    }

    clear(path: ProvisioningPath): void {
        const target = path.target || globalTarget;
        // flag the key and target for no propagation
        let noPropagationBucket = this.noPropagation.get(target);
        if (!noPropagationBucket) {
            noPropagationBucket = new Set();
            this.noPropagation.set(target, noPropagationBucket);
        }
        noPropagationBucket.add(path.key);
        // clear existing provisioning for the key and target
        let bindingContext = this.provisioning.get(target);
        if (!bindingContext) {
            bindingContext = new Map();
            this.provisioning.set(target, bindingContext);
        }
        bindingContext.set(path.key, new Set());
    }

    private shouldPropagate(key: string, target: object): boolean {
        let noPropagationBucket = this.noPropagation.get(target);
        if (noPropagationBucket) {
            return !noPropagationBucket.has(key);
        } else {
            return true;
        }
    }

    set(value: ValueProvisioning<T[keyof T]>): void;
    set(asyncFactory: AsyncFactoryProvisioning<T[keyof T]>): void;
    set(provisioning: AnyProvisioning<T[keyof T]>): void {
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

    private resolveProvider = (provider: AnyProvisioning<T[keyof T]>) => {
        if (isValueProvisioning(provider)) {
            return provider.value;
        } else if (isAsyncFactoryProvisioning(provider)) {
            return  provider.asyncFactory();
        } else {
            throw new Error(`unknown provider: ${JSON.stringify(provider)}`);
        }
    };

    private resolve<T1 extends keyof T>(key: T1, target: object): Array<Promise<T[T1]>> {
        const result = this.parent && this.shouldPropagate(key, target) ? this.parent.resolve(key, target) : [];
        this.resolveByContext(key, globalTarget, result);
        this.resolveByContext(key, target, result);
        return result;
    }

    private resolveByContext(key: string, target: object, accumulator: Array<any>) {
        let bindingContext = this.provisioning.get(target);
        if (bindingContext) {
            let bindingBucket = bindingContext.get(key);
            if (bindingBucket) {
                accumulator.push(...Array.from(bindingBucket).map(this.resolveProvider));
            }
        }
    }
}

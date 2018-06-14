import {BindContext, DependencyProvisioning, ProvisioningPath, Quantity, ResolveContext} from "./types";

const globalTarget = {};

export class Container implements BindContext, ResolveContext {
    private provisioning = new WeakMap<object, Map<string, Set<DependencyProvisioning>>>();
    private noPropagation = new WeakMap<object, Set<string>>();

    constructor(private providerContext: object, private parent?: Container) {

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

    set(provisioning: DependencyProvisioning): void {
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

    get<T>(key: string): Promise<T[]>;
    get<T>(key: string, quantity: Quantity.optional): Promise<T>;
    get<T>(key: string, quantity: Quantity.single): Promise<T>;
    get<T>(key: string, quantity: Quantity.any): Promise<Array<T>>;
    async get(key: string, quantity: Quantity = Quantity.any): Promise<any> {
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

    private resolveProvider = (provider: DependencyProvisioning) => {
        switch (provider.type) {
            case 'value' :
                return provider.value;
            default :
                throw new Error(`unknown provider type: ${provider.type}`);
        }
    };

    private resolve(key: string, target: object): Array<Promise<any>> {
        const result = this.parent && this.shouldPropagate(key, target) ? this.parent.resolve(key, target) : [];
        let bindingContext = this.provisioning.get(target);
        if (bindingContext) {
            let bindingBucket = bindingContext.get(key);
            if (bindingBucket) {
                result.push(...Array.from(bindingBucket).map(this.resolveProvider));
            }
        }
        return result;
    }
}

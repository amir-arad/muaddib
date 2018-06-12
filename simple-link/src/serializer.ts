import { Serializable } from "./serializeable";

type SerializeTransformer<T, s extends Serializable> = {
    transformerId:string
    predicate:(value:any)=>value is T;
    serialize:(value:T)=> s
    deserialize:(value:s)=>T;
}

const regExTransformer:SerializeTransformer<RegExp,string> = {
    transformerId:'regex',
    predicate:(value:any):value is RegExp=>{
        return value instanceof RegExp;
    },
    serialize:(value:RegExp)=>{
        return value.source
    },
    deserialize:(value:string)=>{
        return new RegExp(value);
    }
}


const registry:SerializeTransformer<any,any>[] = [regExTransformer];

export function serialize(data:any){
    return JSON.stringify(data, (key:string,value:any)=>{
        const foundTransformer  = registry.find((transformer)=>transformer.predicate(value));
        if(foundTransformer){
            return {
                __tid:foundTransformer.transformerId,
                value:foundTransformer.serialize(value)
            };
        }
        return value;
    },4)
}


export function deserialize(data:string){
    return JSON.parse(data, (key:string,value:any)=>{
        if(value && value.__tid){
            const foundTransformer  = registry.find((transformer)=>transformer.transformerId===value.__tid);
            if(foundTransformer){
                return foundTransformer.deserialize(value.value);
            }else{
                throw new Error('unknown transformer id '+value.__tid);
            }
        }
        return value;
    })
}


export type Primitive = string | number | boolean | null | undefined;

export interface SerializableArray {
    [key: number]: Serializable
}

export interface SerializableObj {
    [key: string]: Serializable
}

export type Serializable = SerializableObj | SerializableArray | Primitive;

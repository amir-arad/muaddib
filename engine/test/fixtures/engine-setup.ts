import { Register } from '../../src/types';


export interface EditorSystem<NODE, GUI, PREVIEW>{
    node:NODE;
    editorGui:GUI;
    preview:PREVIEW
}
type EditorScopes = keyof EditorSystem<{},{},{}>;
export function editorRegistry<S extends EditorSystem<{},{},{}>>():Register<S,EditorScopes>{
    return {} as any
}

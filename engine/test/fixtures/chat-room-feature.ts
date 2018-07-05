import { ExecutionContext , ActorObject, ActorFactory, ActorMetadata, ActorRef} from "muadib-system";
import {ChatMessage, JoinMessage, ChatRoomProps, ChatClientAddress } from './types';
import { ChatRoomFactory, ChatRoom } from './chat-room';
import {EditorSystem, editorRegistry} from './engine-setup'

export type ChatroomFeature = EditorSystem<{room1:ChatRoom},{},{}>



export default {
    node:async (ctx:ExecutionContext<ChatroomFeature["node"]>)=>{
        const {ChatRoomFactory} = await import('./chat-room');
        ctx.actorOf(ChatRoomFactory as any,{id:'room1'})
    },
    editorGui:async (ctx:ExecutionContext<ChatroomFeature["editorGui"]>)=>{
        const {ChatPanel} = await import('./chat-client');
        const div = document.createElement('div');
        document.appendChild(div);
        new ChatPanel(ctx,{id:'client1','roomId':'room1',name:"Client 1"},div);

        const div2 = document.createElement('div');
        document.appendChild(div2);
        new ChatPanel(ctx,{id:'client2','roomId':'room1',name:"Client 2"},div2);
    }
}

import { ActorObject, ActorRef, ExecutionContext, ActorFactory, ActorMetadata, ActorContext } from "muadib-system";
import { ChatMessage, JoinMessage, ChatRoomProps, ChatClientAddress, ChatRoomAddress } from './types';

export class ChatRoom implements ActorObject<ChatMessage|JoinMessage>{
    members:ActorRef<ChatMessage>[] = [];
    constructor(private ctx:ActorContext<ChatMessage|JoinMessage,{}>, private props:ChatRoomProps){

    }
    onReceive(msg:ChatMessage|JoinMessage){
        if(msg.type===JoinMessage){
            this.members.push(this.ctx.actorFor(ChatClientAddress({id:msg.address})));
        }else if(msg.type===ChatMessage){
            this.members.forEach(member=>{
                member.send(msg)
            })
        }else{
            this.ctx.unhandled();
        }
    }
}



export const ChatRoomFactory:ActorFactory<ChatRoomProps,{},ChatMessage|JoinMessage> & ActorMetadata<ChatRoomProps> = {
    address : ChatRoomAddress,
    create(ctx:ActorContext<ChatMessage|JoinMessage,{}>,props:ChatRoomProps){
        return new ChatRoom(ctx, props)
    }
};

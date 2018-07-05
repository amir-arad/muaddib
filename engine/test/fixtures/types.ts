import { ExecutionContext , ActorObject, ActorFactory, ActorMetadata, ActorRef} from "muadib-system";

const reg:any = {};

export const ChatMessage = "ChatMessage"
export interface ChatMessage{
    type:typeof ChatMessage;
    from:string;
    message:string;
}

export const JoinMessage = "JoinMessage"
export interface JoinMessage{
    type:typeof JoinMessage;
    name:string;
    address:string;
}

export interface ActorPropsWithId{
    id:string
}
export interface ChatRoomProps extends ActorPropsWithId{
    name:string
}
export interface ChatClientProps extends ActorPropsWithId{
    roomId:string;
    id:string;
    name:string;
}


export const ChatRoomAddress = (props:ActorPropsWithId)=>'chatroom:'+props.id;
export const ChatClientAddress = (props:ActorPropsWithId)=>'client:'+props.id;


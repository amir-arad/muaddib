import { ActorObject, ExecutionContext, ActorMetadata, ActorFactory } from "muadib-system";
import { ChatMessage, ChatClientProps, ChatClientAddress } from './types';


export class ChatPanel implements ActorObject<ChatMessage>{
    state:ChatMessage[] = [];
    room =  this.ctx.actorFor(this.props.roomId);
    constructor(private ctx:ExecutionContext<{}>,private props:ChatClientProps,private target:Element){
        this.render();
    };
    onReceive(msg:ChatMessage){
        this.state.push(msg);
        this.target.innerHTML =  this.state.map(msg=>{
            msg.message
        }).join('\n')
    }
    render(){
        this.target.setAttribute('data-id','chat-panel:'+this.props.id);
        this.target.innerHTML =  this.props.name+' '+this.state.map(msg=>{
            msg.message
        }).join('\n')
    }
}




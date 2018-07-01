import {Actor, ActorContext} from "system";
import {ExecutionContext} from "../../system/src/types";


export type MakeNewFrame = {
    type: 'MakeNewFrame';
    systemId: string;
    title?: string;
    script: (ctx: ExecutionContext<any>) => any;
}

export class FramesManager {
    static address = 'FramesManager';

    constructor(private ctx: ActorContext<MakeNewFrame, {}>) {
    }

    onReceive(msg: MakeNewFrame) {
        if (msg.type === 'MakeNewFrame') {
            this.makeNewFrame(msg);
        } else {
            this.ctx.unhandled();
        }
    }

    makeNewFrame(msg: MakeNewFrame) {
        const blob = new Blob([this.generateMagicHTML(msg)], {type: "text/html"});
        const magicBlob = URL.createObjectURL(blob);
        const iframe = document.createElement( "iframe" );
        iframe.setAttribute( "src", magicBlob );
        document.body.insertBefore( iframe , document.body.firstChild )
    }

    generateMagicHTML(msg: MakeNewFrame) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>${msg.title}</title>
</head>
<body style="display: block; margin: 0;" />

</html>`
    }
}

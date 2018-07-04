import {Actor, ActorContext, ClusterMessage, createSystem, ExecutionContext, System, waitForHandshake} from "system";
import {fromEvent} from 'rxjs';
import {filter, map} from 'rxjs/operators';

/**
 * generate a bi-di channel between two windows that is based on postMessage
 */
export class WindowEndpoint {
    public readonly input = fromEvent<MessageEvent>(this.sourceWindow, "message")
        .pipe(
            filter((messageEvent: MessageEvent) => messageEvent.data && this.targetWindow === messageEvent.source),
            map((messageEvent: MessageEvent) => messageEvent.data)
        );
    public readonly output = {
        next: (value: ClusterMessage) => this.targetWindow.postMessage(value, "*")
    };

    constructor(private targetWindow: Window, private sourceWindow: Window = self) {

    }
}

/**
 * connect a system inside an iframe to a system in the main window
 */
export function iframeConnectToMain(system: System<any>) {
    const mainWindowEndpoint = new WindowEndpoint(window.parent, window);
    system.cluster.connect(mainWindowEndpoint.input).subscribe(mainWindowEndpoint.output);
}

/**
 * connect a system inside a window to a system in a child iframe
 */
export function mainConnectToIframe(system: System<any>, iframeWindow: Window) {
    const mainWindowEndpoint = new WindowEndpoint(iframeWindow, window);
    system.cluster.connect(mainWindowEndpoint.input).subscribe(mainWindowEndpoint.output);
}

/**
 * a utility to load a script in an iframe
 * @param {string} scriptUrl absolute URL of the script to load
 * @param {(iframeWindow: Window) => any} onLoad callback to when the window is loaded
 */
export function loadIframeScript(scriptUrl: string, onLoad: (iframeWindow: Window) => any) {
    const blob = new Blob([`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>foo</title>
    <script src="${scriptUrl}"></script>
</head>
<body style="display: block; margin: 0;" >
</body>
</html>`], {type: "text/html"});
    const magicBlob = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.src = magicBlob;
    document.body.insertBefore(iframe, document.body.firstChild);

    iframe.addEventListener("load", function () {
        const iframeWindow = iframe.contentWindow;
        if (!iframeWindow) {
            throw new Error('what no window');
        }
        onLoad(iframeWindow);
    });
}

import {ActorContext, ActorObject, System} from "system";
import {createSystem} from "system";
import {iframeConnectToMain} from "../src";
import {Sampler} from "./sampler";

const system = createSystem('test-iframe');
iframeConnectToMain(system);

system.run(async ctx => {
    ctx.actorOf(Sampler);
});

/// <reference path="node_modules/inversify-dts/inversify-devtools/inversify-devtools.d.ts"/>

import Battle from "./interfaces/battle";
import container from "./config/ioc_config";
import SERVICE_IDENTIFIER from "./constants/identifiers";

// Composition root
let epicBattle = container.get<Battle>(SERVICE_IDENTIFIER.BATTLE);

console.log(epicBattle.fight());



import render from "inversify-devtools";
import { Kernel } from "inversify";

let containerId = "root";
let connectKernel = render(containerId);
let kernel = new Kernel();
connectKernel(kernel);



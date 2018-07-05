import {createSystem, ActorObject} from "muadib-system";
import { expect } from 'chai'
// import {ActorContext, ActorObject, ActorRef, createSystem, MessageAndContext} from "../src";
import {MultiSystem, NODE_AUTO} from '../src/engine';

import {Browser, launch, Page} from 'puppeteer'

describe('application engine', () => {
    describe('setup', () => {
        it('allows init system through config file', async () => {
            const system = new MultiSystem({
                node:NODE_AUTO,
                editorGui:{
                    uri:'editor'
                },
                preview:{
                    uri:'preview'
                }
            })


            await system.loadPlugins(['./chat-room-feature'])
            await system.start();

            const browser = await launch({

            })
            const page = await browser.newPage();
            await page.goto('http:/localhost:8080');

            await page.waitForSelector('[data-id="chat-panel:client1]');

        });

    });
});

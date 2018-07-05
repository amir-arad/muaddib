import {createSystem, ActorObject} from "muadib-system";
import { expect } from 'chai'
// import {ActorContext, ActorObject, ActorRef, createSystem, MessageAndContext} from "../src";
import {MultiSystem, NODE} from '../src/engine';

import {Browser, launch, Page} from 'puppeteer'
import chatRoomFeature from './fixtures/chat-room-feature';

describe('application engine', () => {
    describe('setup', () => {
        it('allows init system through config file', async () => {
            const system = new MultiSystem({
                editorServer:{
                    type:'local'
                },
                editorGui:{
                    type:'server-entry',
                    uri:'editor'
                },
                preview:{
                    type:'server-entry',
                    uri:'preview'
                },
                editorPreview:{
                    type:'iframe'
                }
            })


            await system.loadPlugins(['/chat-room-feature.bundle.js'])
            await system.start('editorServer');

            const browser = await launch({

            })
            const page = await browser.newPage();
            await page.goto('http:/localhost:8080');

            await page.waitForSelector('[data-id="chat-panel:client1]');

        });

    });
});

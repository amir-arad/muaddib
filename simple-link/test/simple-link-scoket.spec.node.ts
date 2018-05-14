import {connect} from '../src'
import {nodeSocketEndPoint} from "../src/simple-link-socket-node";
import * as http from 'http';
import * as socketIo from 'socket.io';
import * as sinon from "sinon";
import {expect} from 'chai';
import {socketEndpoint} from '../src/simple-link-socket-client';
import * as socketIoClient from 'socket.io-client';
import { Server } from 'http';
import { delay } from './utils';

let serverHandler = sinon.spy();

interface WindowApi {
    dang: (text: string) => string;
    regexify: (text: string) => RegExp;
}


interface ServerApi {
    bang: (text: string) => string;
}

describe('simple link over socket.io', () => {
    let windowApi: WindowApi | undefined;
    let socket: SocketIOClient.Socket;
    let app: Server;
    async function getWindowsApi():Promise<WindowApi> {
        while (!windowApi){
            await delay(10);
        }
        return windowApi;
    }
    before(() => {
        app = http.createServer(()=>{});
        const io = socketIo(app);
        app.listen(11965);
        io.on('connection', async (socket: SocketIO.Socket) => {
            windowApi = await connect<WindowApi>({
                otherSideId: 'simpleLinkClient',
                target: await nodeSocketEndPoint(socket),
                thisSideId: 'simpleLinkServer'
            }, {
                bang: serverHandler
            });
        });
    });
    after(()=>{
        app.close();
    })
    beforeEach(() => {
        socket = socketIoClient.connect('http://localhost:11965', {reconnection:false});
    });
    afterEach(() => {
        windowApi = undefined;
        socket.close();
    });

    it('should allow clients to connect and call methods in server', async () => {
        const api = await connect<ServerApi>({
            thisSideId: 'simpleLinkClient',
            otherSideId: 'simpleLinkServer',
            target: await socketEndpoint(socket)
        }, {});
        await api.bang('gaga');
        expect(serverHandler).to.have.been.calledWith('gaga');
    });

    it('should allow calling apis server to client', async () => {
        await connect<ServerApi>({
            thisSideId: 'simpleLinkClient',
            otherSideId: 'simpleLinkServer',
            target: await socketEndpoint(socket)
        }, {
            dang: (text: string) => text + "!!"
        });
        const res = await (await getWindowsApi()).dang('gaga');
        expect(res).to.equal('gaga!!')
    });

    it('should allow passing regex', async () => {
        await connect<ServerApi>({
            thisSideId: 'simpleLinkClient',
            otherSideId: 'simpleLinkServer',
            target: await socketEndpoint(socket)
        }, {
            regexify: (text: string) => new RegExp(text)
        });
        const res = await (await getWindowsApi()).regexify('gaga');
        expect(res instanceof RegExp).to.equal(true);
        expect(res.source).to.equal('gaga');
    });
});

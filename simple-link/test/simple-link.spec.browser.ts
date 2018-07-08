import {
    connect,
    ConnectionConfig,
    disposeAllConnections,
    disposeConnection,
    replaceLocalApi,
    replaceRemoteApi
} from '../src';
import {expect} from 'chai';
import {delay} from './utils';

interface API {
    echo: (data: string) => Promise<string>
}

function getConfig(channel: MessageChannel, side: 1 | 2, name: string = 'side'): ConnectionConfig {
    if (side === 1) {
        return {
            otherSideId: name + '2',
            thisSideId: name + '1',
            target: channel.port1
        }
    }
    return {
        otherSideId: name + '1',
        thisSideId: name + '2',
        target: channel.port2
    }
}

describe('simple-link', function () {
    afterEach(() => {
        disposeAllConnections();
    })
    describe('in same vm', function () {
        it('should return upon performing handshake', async () => {
            const channel = new MessageChannel();
            let resolved = false;
            connect(getConfig(channel, 1), {})
                .then(() => {
                    resolved = true;
                });

            expect(resolved).to.equal(false);
            await connect(getConfig(channel, 2), {});
            await delay(1);
            expect(resolved).to.equal(true);
        });
        it('should support reconnect handshake', async () => {
            const channel = new MessageChannel();
            let resolved = false;
            connect(getConfig(channel, 1), {})
                .then(() => {
                    resolved = true;
                });

            expect(resolved).to.equal(false);
            await connect(getConfig(channel, 2), {});
            await delay(1);
            expect(resolved).to.equal(true);
            await connect(getConfig(channel, 2), {});
        });
        it('should allow calling methods from A to B', async () => {
            const channel = new MessageChannel();

            const impl: API = {echo: (data: string) => Promise.resolve('echo: ' + data)}
            connect(getConfig(channel, 1), impl);
            const bsideAPI = await connect<API>(getConfig(channel, 2), {});

            expect(await bsideAPI.echo('gaga')).to.equal('echo: gaga')
        });

        it('should allow calling methods both ways', async () => {
            const channel = new MessageChannel();

            const implA: API = {echo: (data: string) => Promise.resolve('echo A: ' + data)};
            const implB: API = {echo: (data: string) => Promise.resolve('echo B: ' + data)};
            const bsideAPI = connect<API>(getConfig(channel, 1), implA);
            const asideAPI = await connect<API>(getConfig(channel, 2), implB);

            expect(await (await bsideAPI).echo('daga')).to.equal('echo B: daga');
            expect(await asideAPI.echo('gaga')).to.equal('echo A: gaga');
        });

        it('throws when calling invalid target', async () => {
            const channel = new MessageChannel();

            connect<API>(getConfig(channel, 2), {
                async foo() {
                }
            });
            const bsideAPI = await connect<{ bar: () => Promise<void> }>(getConfig(channel, 1), {});

            expect(bsideAPI).to.haveOwnProperty('foo');
            expect(bsideAPI).to.not.haveOwnProperty('bar');
        });

        it('Api call is rejected if code throws string error on other side', async () => {
            const channel = new MessageChannel();

            connect(getConfig(channel, 2), {
                echo: () => {
                    throw('some error')
                }
            });
            const bsideAPI = await connect<API>(getConfig(channel, 1), {});

            return await expect(bsideAPI.echo('hello')).to.be.rejectedWith('some error')
        });

        it('Api call is rejected if code throws error on the other side', async () => {
            const channel = new MessageChannel();

            connect(getConfig(channel, 2), {
                echo: () => {
                    throw(new Error('some error'))
                }
            });
            const bsideAPI = await connect<API>(getConfig(channel, 1), {});

            return await expect(bsideAPI.echo('hello')).to.be.rejectedWith('some error')
        });

        it('Api call is rejected if code rejects on the other side', async () => {
            const channel = new MessageChannel();

            connect(getConfig(channel, 2), {
                echo: () => {
                    return Promise.reject('some error')
                }
            });
            const bsideAPI = await connect<API>(getConfig(channel, 1), {});

            return await expect(bsideAPI.echo('hello')).to.be.rejectedWith('some error')
        });


        it('should allow multiple connections over the same endpoints', async () => {
            const channel = new MessageChannel();

            const implA: API = {echo: (data: string) => Promise.resolve('echo A: ' + data)};
            const implB: API = {echo: (data: string) => Promise.resolve('echo B: ' + data)};
            const implA2: API = {echo: (data: string) => Promise.resolve('echo C: ' + data)};
            const implB2: API = {echo: (data: string) => Promise.resolve('echo D: ' + data)};
            const bsideAPI = connect<API>(getConfig(channel, 1), implA);
            const asideAPI = await connect<API>(getConfig(channel, 2), implB);
            const addedApiId = 'addedapi'
            const asideAPI2 = connect<API>(getConfig(channel, 1, addedApiId), implA2);
            const bsideAPI2 = await connect<API>(getConfig(channel, 2, addedApiId), implB2);

            expect(await (await bsideAPI).echo('daga')).to.equal('echo B: daga');
            expect(await asideAPI.echo('gaga')).to.equal('echo A: gaga');

            expect(await bsideAPI2.echo('gaga')).to.equal('echo C: gaga');
            expect(await (await asideAPI2).echo('daga')).to.equal('echo D: daga');
        });

        it('should allow disposing connections', async () => {
            const channel = new MessageChannel();

            const implA: API = {echo: (data: string) => Promise.resolve('echo A: ' + data)};
            const implB: API = {echo: (data: string) => Promise.resolve('echo B: ' + data)};
            const implA2: API = {echo: (data: string) => Promise.resolve('echo C: ' + data)};
            const implB2: API = {echo: (data: string) => Promise.resolve('echo D: ' + data)};
            const bsideAPIPromise = connect<API>(getConfig(channel, 1), implA);
            const asideAPI = await connect<API>(getConfig(channel, 2), implB);
            const asideAPI2Promise = connect<API>(getConfig(channel, 1, 'addedapi'), implA2);
            const bsideAPI2 = await connect<API>(getConfig(channel, 2, 'addedapi'), implB2);

            const bsideAPI = await bsideAPIPromise;
            const asideAPI2 = await asideAPI2Promise;
            expect(await bsideAPI.echo('daga')).to.equal('echo B: daga');
            expect(await asideAPI.echo('gaga')).to.equal('echo A: gaga');

            expect(await bsideAPI2.echo('gaga')).to.equal('echo C: gaga');
            expect(await asideAPI2.echo('daga')).to.equal('echo D: daga');

            disposeConnection(bsideAPI2);


            expect(() => bsideAPI2.echo('gaga')).to.Throw('Connection has been disposed');
            expect(asideAPI2.echo('gaga')).to.be.rejectedWith('Connection has been disposed from the other side');

            expect(await bsideAPI.echo('daga')).to.equal('echo B: daga');
            expect(await asideAPI.echo('gaga')).to.equal('echo A: gaga');


        });
    });

    describe('simple-link-proxy', function () {
        it('should allow proxing local side api', async () => {
            const channel = new MessageChannel();

            const implA: API = {echo: (data: string) => Promise.resolve('echo A: ' + data)};
            const implB: API = {echo: (data: string) => Promise.resolve('echo B: ' + data)};
            const bsideAPI = connect<API>(getConfig(channel, 1), implA);
            const asideAPI = await connect<API>(getConfig(channel, 2), implB);

            expect(await (await asideAPI).echo('daga')).to.equal('echo A: daga');
            expect(await (await bsideAPI).echo('daga')).to.equal('echo B: daga');

            replaceLocalApi<API>('side1', 'side2', (hijacked: API) => {
                return <API>{
                    echo: (text: string) => hijacked.echo(text).then((echo: string) => echo + '!')
                }
            });

            expect(await (await asideAPI).echo('daga')).to.equal('echo A: daga');
            expect(await (await bsideAPI).echo('daga')).to.equal('echo B: daga!');

        });

        it('should allow proxing remote side api', async () => {
            const channel = new MessageChannel();

            const implA: API = {echo: (data: string) => Promise.resolve('echo A: ' + data)};
            const implB: API = {echo: (data: string) => Promise.resolve('echo B: ' + data)};
            const bsideAPI = connect<API>(getConfig(channel, 1), implA);
            const asideAPI = await connect<API>(getConfig(channel, 2), implB);

            expect(await (await asideAPI).echo('daga')).to.equal('echo A: daga');
            expect(await (await bsideAPI).echo('daga')).to.equal('echo B: daga');

            replaceRemoteApi<API>('side1', 'side2', (hijacked: API) => {
                return <API>{
                    echo: (text: string) => hijacked.echo(text).then((echo: string) => echo + '!')
                }
            });

            expect(await (await asideAPI).echo('daga')).to.equal('echo A: daga');
            expect(await (await bsideAPI).echo('daga')).to.equal('echo B: daga!');

        });
        it('local side api proxy can be partial', async () => {
            const channel = new MessageChannel();

            interface API {
                a: (str: string) => Promise<string>;
                b: (str: string) => Promise<string>;
            }

            const implA: API = {
                a: (data: string) => Promise.resolve('echo A: ' + data),
                b: (data: string) => Promise.resolve('echo B: ' + data)
            };
            const bsideAPI = connect<{}>(getConfig(channel, 1), implA);
            const asideAPI = await connect<API>(getConfig(channel, 2), {});

            expect(await (await asideAPI).a('daga')).to.equal('echo A: daga');
            expect(await (await asideAPI).b('daga')).to.equal('echo B: daga');

            replaceRemoteApi<API>('side2', 'side1', (hijacked: API) => {
                return <API>{
                    a: (text: string) => hijacked.a(text).then((echo: string) => echo + '!')
                }
            });

            expect(await (await asideAPI).a('daga')).to.equal('echo A: daga!');
            expect(await (await asideAPI).b('daga')).to.equal('echo B: daga');

        });
    });
});



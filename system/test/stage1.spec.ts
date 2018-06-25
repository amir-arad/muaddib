import {expect, plan} from "./testkit/chai.spec";
import {ActorContext, ActorObject, ActorRef, createSystem, MessageAndContext} from "../src";

function randomDelay() {
    return new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 45));
}

describe('system', () => {
    describe('stage 1 - single vm, shallow plugins demo app', () => {
        it('load two plugins and have them all find and communicate with each other', plan(2, async () => {
            // demonstrate akka's hello world flow in the system
            // https://github.com/typesafehub/activator-hello-akka/blob/master/src/main/scala/HelloAkkaScala.scala
            interface WhoToGreet {
                type: 'WhoToGreet';
                who: string;
            }

            interface Greet {
                type: 'Greet';
            }

            class Greeter implements ActorObject<WhoToGreet | Greet> {
                static address = 'greeter';
                greeting = "";

                constructor(private ctx: ActorContext<WhoToGreet | Greet, {}>) {
                }

                onReceive(msg: WhoToGreet | Greet) {
                    if (msg.type === 'WhoToGreet') {
                        this.greeting = "hello, " + msg.who;
                    } else if (msg.type === 'Greet' && this.ctx.replyTo) {
                        // Send the current greeting back to the sender
                        this.ctx.replyTo.send({type: 'Greeting', message: this.greeting});
                    } else {
                        this.ctx.unhandled();
                    }
                }
            }

            const system = createSystem();
            // system.log.subscribe(m => console.log(JSON.stringify(m)));
            await system.run(async ctx => {

                // Create the 'greeter' actor
                const greeter = ctx.actorOf(Greeter);
                // Tell the 'greeter' to change its 'greeting' message
                greeter.send({type: 'WhoToGreet', who: 'muadib'});
                // Ask the 'greeter for the latest 'greeting' and catch the next message that will arrive at the mailbox
                let message = await greeter.ask({type: 'Greet'});
                expect(message.body, '1st message').to.eql({type: 'Greeting', message: 'hello, muadib'});

                // Change the greeting and ask for it again
                greeter.send({type: 'WhoToGreet', who: 'system'});

                message = await greeter.ask({type: 'Greet'});
                expect(message.body, '2nd message').to.eql({type: 'Greeting', message: 'hello, system'});
            }, 'testCase');
        }));

        describe('the bank example', () => {
            interface ChangeBalance {
                type: 'ChangeBalance';
                reference?: string | number;
                delta: number;
            }

            interface Succeeded {
                type: 'Succeeded';
                reference: string | number;
            }

            interface Rejected {
                type: 'Rejected';
                reference: string | number;
            }

            interface SetBalance {
                type: 'SetBalance';
                reference?: string | number;
                balance: number;
            }

            interface CheckBalance {
                type: 'CheckBalance';
            }

            /**
             * simulate lazily, dynamically importing AccountImpl
             */
            const Account = {
                address({id}: { id: string }) {
                    return `Account:${id}`
                },
                async create(ctx: ActorContext<ChangeBalance | CheckBalance | SetBalance, {}>, props: { balance: number }) {
                    await randomDelay(); // fake dynamic import
                    return new AccountImpl(ctx, props);
                }
            };

            class AccountImpl implements ActorObject<ChangeBalance | CheckBalance | SetBalance> {
                balance: number;

                constructor(private ctx: ActorContext<ChangeBalance | CheckBalance | SetBalance, {}>, {balance}: { balance: number }) {
                    this.balance = balance;
                }

                async onReceive(msg: ChangeBalance | CheckBalance | SetBalance) {
                    const oldBalance = this.balance;
                    try {
                        if (msg.type === 'SetBalance') {
                            // simulate async processing
                            await randomDelay();
                            this.balance = msg.balance;
                        } else if (msg.type === 'ChangeBalance') {
                            // simulate async processing
                            await randomDelay();
                            this.balance += msg.delta;
                        } else if (msg.type === 'CheckBalance' && this.ctx.replyTo) {
                            this.ctx.replyTo.send({type: 'Balance', balance: this.balance});
                        } else {
                            this.ctx.unhandled();
                        }
                    } finally {
                        const reference = (msg as any).reference;
                        // negative balance is an invalid state
                        if (this.balance < 0) {
                            this.balance = oldBalance;
                            if (this.ctx.replyTo && reference) {    // notify failure
                                this.ctx.replyTo.send({type: 'Rejected', reference});
                            }
                        } else if (this.balance != oldBalance) {
                            if (this.ctx.replyTo && reference) { // notify success
                                this.ctx.replyTo.send({type: 'Succeeded', reference});
                            }
                        }
                    }
                }
            }

            it('Account demo : ordered, serial execution per actor', plan(2, async () => {
                const system = createSystem();
                // system.log.subscribe(m => console.log(JSON.stringify(m)));
                await system.run(async ctx => {
                    const alice = ctx.actorOf(Account, {id: 'alice', balance: 0});

                    await alice.send({
                        type: 'ChangeBalance',
                        delta: 150,
                        reference: 'fooo'
                    });

                    expect((await alice.ask({type: 'CheckBalance'})).body, '1st balance').to.have.property('balance', 150);
                    alice.send({type: 'ChangeBalance', delta: -100});
                    alice.send({type: 'SetBalance', balance: 123});
                    expect((await alice.ask({type: 'CheckBalance'})).body, '2nd balance').to.have.property('balance', 123);
                });
            }));

            it('plugins lazy loading, prototype and singleton', plan(8, async () => {
                interface OpenAccount {
                    type: 'OpenAccount';
                    name: string;
                    balance: number;
                }

                interface CheckBalance {
                    type: 'CheckBalance';
                    name: string;
                }

                interface Transfer {
                    type: 'Transfer';
                    reference: string;
                    from: string;
                    to: string;
                    amount: number;
                }

                class Bank implements ActorObject<OpenAccount | Transfer | CheckBalance> {
                    static address = 'bank';

                    constructor(private ctx: ActorContext<OpenAccount | Transfer | CheckBalance, {}>) {
                    }

                    onReceive(msg: OpenAccount | Transfer | CheckBalance) {
                        if (msg.type === 'OpenAccount') {
                            this.ctx.actorOf(Account, {id: msg.name, balance: msg.balance});
                        } else if (msg.type === 'CheckBalance' && this.ctx.replyTo) {
                            // forward the request to the account actor
                            const accountRef = this.ctx.actorFor(Account.address({id: msg.name}));
                            accountRef.send({type: 'CheckBalance'}, this.ctx.replyTo);
                        } else if (msg.type === 'Transfer') {
                            // don't sync the following operation with this actor
                            this.transfer(msg, this.ctx.replyTo);
                        } else {
                            this.ctx.unhandled();
                        }
                    }

                    private async transfer(msg: Transfer, replyTo?: ActorRef<any>) {
                        // send deduction request to the 'from' side
                        const fromAccountRef = this.ctx.actorFor(Account.address({id: msg.from}));
                        const deductionResult = await fromAccountRef.ask({
                            type: 'ChangeBalance',
                            reference: msg.reference,
                            delta: -msg.amount
                        }, {id: `Transfer:${msg.reference}`}) as MessageAndContext<Succeeded | Rejected>;
                        if (deductionResult.body.type === 'Succeeded') {
                            const toAccountRef = this.ctx.actorFor(Account.address({id: msg.to}));
                            toAccountRef.send({
                                type: 'ChangeBalance',
                                delta: msg.amount,
                                reference: msg.reference
                            }, replyTo);
                        } else if (deductionResult.body.type === 'Rejected') {
                            // report rejection
                            replyTo && replyTo.send(deductionResult.body);
                        } else {
                            deductionResult.unhandled();
                        }
                    }
                }

                const system = createSystem();
                // system.log.subscribe(m => console.log(JSON.stringify(m)));
                await system.run(async ctx => {
                    const bank = ctx.actorOf(Bank);

                    async function assertBalances(alice: number, bob: number, msg: string) {
                        const aliceBalanceMsg = bank.ask({
                            type: 'CheckBalance',
                            name: 'Alice'
                        }, {id: `Alice balance ${msg}`});
                        expect((await aliceBalanceMsg).body, `Alice balance ${msg}`).to.have.deep.property('balance', alice);
                        const bobBalanceMsg = bank.ask({
                            type: 'CheckBalance',
                            name: 'Bob'
                        }, {id: `Bob balance ${msg}`});
                        expect((await bobBalanceMsg).body, `Bob balance ${msg}`).to.have.property('balance', bob);
                    }

                    bank.send({type: 'OpenAccount', name: 'Alice', balance: 100});
                    bank.send({type: 'OpenAccount', name: 'Bob', balance: 0});
                    await assertBalances(100, 0, 'initially');
                    expect((await bank.ask({
                        type: 'Transfer',
                        from: 'Alice',
                        reference: 'first',
                        to: 'Bob',
                        amount: 60
                    }, {id: 'first transfer'})).body).to.eql({type: 'Succeeded', reference: 'first'});
                    await assertBalances(40, 60, 'after transfer');
                    expect((await bank.ask({
                        type: 'Transfer',
                        from: 'Alice',
                        reference: 'second',
                        to: 'Bob',
                        amount: 60
                    }, {id: 'second transfer'})).body).to.eql({type: 'Rejected', reference: 'second'});
                    await assertBalances(40, 60, 'after rejected transfer');
                });
            }));
        });
    });
});

import {expect, plan} from "./testkit/chai.spec";
import {Actor, ActorContext, ActorRef, Mailbox, System} from "../src";

function randomDelay() {
    return new Promise(resolve => setTimeout(resolve, Math.random() * 10));
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

            class Greeter implements Actor<WhoToGreet | Greet> {
                static address = 'greeter';
                greeting = "";

                constructor(private ctx: ActorContext<WhoToGreet | Greet>) {
                }

                onReceive(msg: WhoToGreet | Greet) {
                    if (msg.type === 'WhoToGreet') {
                        this.greeting = "hello, " + msg.who;
                    } else if (msg.type === 'Greet' && this.ctx.replyTo) {
                        // Send the current greeting back to the sender
                        this.ctx.send(this.ctx.replyTo, {type: 'Greeting', message: this.greeting});
                    } else {
                        this.ctx.unhandled();
                    }
                }
            }

            const system = new System();
            // Create the 'greeter' actor
            const greeter = await system.actorOf(Greeter);
            // Tell the 'greeter' to change its 'greeting' message
            system.send(greeter, {type: 'WhoToGreet', who: 'muadib'});

            // Create the "actor-in-a-box"
            const mailbox = new Mailbox(system);

            // Ask the 'greeter for the latest 'greeting' and catch the next message that will arrive at the mailbox
            let message = mailbox.ask(greeter, {type: 'Greet'});
            expect(await message, '1st message').to.eql({type: 'Greeting', message: 'hello, muadib'});

            // Change the greeting and ask for it again
            system.send(greeter, {type: 'WhoToGreet', who: 'system'});

            message = mailbox.ask(greeter, {type: 'Greet'});
            expect(await message, '2nd message').to.eql({type: 'Greeting', message: 'hello, system'});
        }));
        describe('the bank example', () => {
            interface ChangeBalance {
                type: 'ChangeBalance';
                reference?: number;
                delta: number;
            }

            interface Succeeded {
                type: 'Succeeded';
                reference: number;
            }

            interface Rejected {
                type: 'Rejected';
                reference: number;
            }

            interface SetBalance {
                type: 'SetBalance';
                reference?: number;
                balance: number;
            }

            interface CheckBalance {
                type: 'CheckBalance';
            }

            class Account implements Actor<ChangeBalance | CheckBalance | SetBalance> {
                static address({id}: { id: string }) {
                    return `Account:${id}`
                }

                balance: number;

                constructor(private ctx: ActorContext<ChangeBalance | CheckBalance | SetBalance>, {balance}: { balance: number }) {
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
                            this.ctx.send(this.ctx.replyTo, {type: 'Balance', balance: this.balance});
                        } else {
                            this.ctx.unhandled();
                        }
                    } finally {
                        const reference = (msg as any).reference;
                        // negative balance is an invalid state
                        if (this.balance < 0) {
                            this.balance = oldBalance;
                            if (this.ctx.replyTo && reference) {    // notify failure
                                this.ctx.send(this.ctx.replyTo, {type: 'Rejected', reference});
                            }
                        } else if (this.balance != oldBalance) {
                            if (this.ctx.replyTo && reference) { // notify success
                                this.ctx.send(this.ctx.replyTo, {type: 'Succeeded', reference});
                            }
                        }
                    }
                }
            }

            it('Account demo : ordered, serial execution per actor', plan(2, async () => {
                const system = new System();
                system.log.subscribe(m => console.log(JSON.stringify(m)));

                const alice = await system.actorOf(Account, {id: 'alice', balance: 0});

                const mailbox = new Mailbox(system);

                await mailbox.ask(alice, {
                    type: 'ChangeBalance',
                    delta: 150,
                    reference: 'fooo'
                }, res => res.type === 'Succeeded');

                expect(await mailbox.ask(alice, {type: 'CheckBalance'}), '1st balance').to.have.property('balance', 150);
                system.send(alice, {type: 'ChangeBalance', delta: -100});
                system.send(alice, {type: 'SetBalance', balance: 123});
                expect(await mailbox.ask(alice, {type: 'CheckBalance'}), '2nd balance').to.have.property('balance', 123);
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
                    reference: number;
                    from: string;
                    to: string;
                    amount: number;
                }

                class Bank implements Actor<OpenAccount | Transfer | CheckBalance> {
                    static address = 'bank';

                    constructor(private ctx: ActorContext<OpenAccount | Transfer | CheckBalance>) {
                    }

                    async onReceive(msg: OpenAccount | Transfer | CheckBalance) {
                        if (msg.type === 'OpenAccount') {
                            await this.ctx.system.actorOf(Account, {id: msg.name, balance: msg.balance});
                        } else if (msg.type === 'CheckBalance' && this.ctx.replyTo) {
                            // forward the request to the account actor
                            const accountRef = this.ctx.system.actorFor(Account.address({id: msg.name}));
                            this.ctx.system.send(accountRef, {type: 'CheckBalance'}, this.ctx.replyTo);
                        } else if (msg.type === 'Transfer') {
                            this.transfer(msg, this.ctx.replyTo);
                        } else {
                            this.ctx.unhandled();
                        }
                    }

                    private async transfer(msg: Transfer, replyTo?: ActorRef<any>) {
                        // create a new actor address to manage the transfer
                        const manager = new Mailbox(this.ctx.system, `Transfer:${msg.reference}`);
                        // send deduction request to the 'from' side
                        const fromAccountRef = this.ctx.system.actorFor(Account.address({id: msg.from}));

                        const deductionResult = await manager.ask(fromAccountRef, {
                            type: 'ChangeBalance',
                            reference: msg.reference,
                            delta: -msg.amount
                        });
                        if (deductionResult.type === 'Succeeded') {
                            const toAccountRef = this.ctx.system.actorFor(Account.address({id: msg.to}));
                            this.ctx.system.send(toAccountRef, {
                                type: 'ChangeBalance',
                                delta: msg.amount,
                                reference: msg.reference
                            }, replyTo);
                        } else if (deductionResult.type === 'Rejected') {
                            // report rejection
                            replyTo && this.ctx.system.send(replyTo, deductionResult);
                        } else {
                            this.ctx.unhandled();
                        }
                    }
                }


                const system = new System();
                //   system.log.subscribe(m => console.log(JSON.stringify(m)));
                const bank = await system.actorOf(Bank);

                async function assertBalances(alice: number, bob: number, msg: string) {
                    const aliceBalanceMsg = mailbox.ask(bank, {
                        type: 'CheckBalance',
                        name: 'Alice'
                    }, res => res.type === 'Balance');
                    expect(await aliceBalanceMsg, `Alice balance ${msg}`).to.have.property('balance', alice);
                    const bobBalanceMsg = mailbox.ask(bank, {
                        type: 'CheckBalance',
                        name: 'Bob'
                    }, res => res.type === 'Balance');
                    expect(await bobBalanceMsg, `Bob balance ${msg}`).to.have.property('balance', bob);
                }

                system.send(bank, {type: 'OpenAccount', name: 'Alice', balance: 100});
                system.send(bank, {type: 'OpenAccount', name: 'Bob', balance: 0});
                const mailbox = new Mailbox(system);
                await assertBalances(100, 0, 'initially');
                expect(await mailbox.ask(bank, {
                    type: 'Transfer',
                    from: 'Alice',
                    reference: 'first',
                    to: 'Bob',
                    amount: 60
                })).to.eql({type: 'Succeeded', reference: 'first'});
                await assertBalances(40, 60, 'after transfer');
                expect(await mailbox.ask(bank, {
                    type: 'Transfer',
                    from: 'Alice',
                    reference: 'second',
                    to: 'Bob',
                    amount: 60
                })).to.eql({type: 'Rejected', reference: 'second'});
                await assertBalances(40, 60, 'after rejected transfer');
            }));
        });
    });
});

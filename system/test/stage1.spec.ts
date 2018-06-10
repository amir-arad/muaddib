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
                    } else if (msg.type === 'Greet' && this.ctx.from) {
                        // Send the current greeting back to the sender
                        this.ctx.send(this.ctx.from, {type: 'Greeting', message: this.greeting});
                    } else {
                        this.ctx.unhandled();
                    }
                }
            }

            const system = new System();
            // Create the 'greeter' actor
            await system.actorOf(Greeter);
            // Tell the 'greeter' to change its 'greeting' message
            system.send(Greeter.address, {type: 'WhoToGreet', who: 'muadib'});

            // Create the "actor-in-a-box"
            const mailbox = new Mailbox(system);

            // Ask the 'greeter for the latest 'greeting' and catch the next message that will arrive at the mailbox
            let message = mailbox.ask(Greeter.address, {type: 'Greet'});
            expect(await message, '1st message').to.eql({type: 'Greeting', message: 'hello, muadib'});

            // Change the greeting and ask for it again
            system.send(Greeter.address, {type: 'WhoToGreet', who: 'system'});

            message = mailbox.ask(Greeter.address, {type: 'Greet'});
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
                        } else if (msg.type === 'CheckBalance' && this.ctx.from) {
                            this.ctx.send(this.ctx.from, {type: 'Balance', balance: this.balance});
                        } else {
                            this.ctx.unhandled();
                        }
                    } finally {
                        const reference = (msg as any).reference;
                        // negative balance is an invalid state
                        if (this.balance < 0) {
                            this.balance = oldBalance;
                            if (this.ctx.from && reference) {    // notify failure
                                this.ctx.send(this.ctx.from, {type: 'Rejected', reference});
                            }
                        } else if (this.balance != oldBalance) {
                            if (this.ctx.from && reference) { // notify success
                                this.ctx.send(this.ctx.from, {type: 'Succeeded', reference});
                            }
                        }
                    }
                }
            }

            it('Account demo : ordered, serial execution per actor', plan(2, async () => {
                const system = new System();
                // system.log.subscribe(m => console.log(JSON.stringify(m)));

                await system.actorOf(Account, {id: 'alice', balance: 0});
                const alice = Account.address({id: 'alice'});

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
                        } else if (msg.type === 'CheckBalance' && this.ctx.from) {
                            // forward the request to the account actor
                            this.ctx.system.send(Account.address({id: msg.name}), {type: 'CheckBalance'}, this.ctx.from);
                        } else if (msg.type === 'Transfer') {
                            this.transfer(msg, this.ctx.from);
                        } else {
                            this.ctx.unhandled();
                        }
                    }

                    private async transfer(msg: Transfer, from?: ActorRef<any>) {
                        // create a new actor address to manage the transfer
                        const manager = new Mailbox(this.ctx.system, `Transfer:${msg.reference}`);
                        // send deduction request to the 'from' side
                        const deductionResult = await manager.ask(Account.address({id: msg.from}), {
                            type: 'ChangeBalance',
                            reference: msg.reference,
                            delta: -msg.amount
                        });
                        if (deductionResult.type === 'Succeeded') {
                            this.ctx.system.send(Account.address({id: msg.to}), {
                                type: 'ChangeBalance',
                                delta: msg.amount,
                                reference: msg.reference
                            }, from);
                        } else if (deductionResult.type === 'Rejected') {
                            // report rejection
                            from && this.ctx.system.send(from, deductionResult);
                        } else {
                            this.ctx.unhandled();
                        }
                    }
                }

                async function assertBalances(alice: number, bob: number, msg: string) {
                    const aliceBalanceMsg = mailbox.ask(Bank.address, {
                        type: 'CheckBalance',
                        name: 'Alice'
                    }, res => res.type === 'Balance');
                    expect(await aliceBalanceMsg, `Alice balance ${msg}`).to.have.property('balance', alice);
                    const bobBalanceMsg = mailbox.ask(Bank.address, {
                        type: 'CheckBalance',
                        name: 'Bob'
                    }, res => res.type === 'Balance');
                    expect(await bobBalanceMsg, `Bob balance ${msg}`).to.have.property('balance', bob);
                }

                const system = new System();
                //   system.log.subscribe(m => console.log(JSON.stringify(m)));
                await system.actorOf(Bank);
                system.send(Bank.address, {type: 'OpenAccount', name: 'Alice', balance: 100});
                system.send(Bank.address, {type: 'OpenAccount', name: 'Bob', balance: 0});
                const mailbox = new Mailbox(system);
                await assertBalances(100, 0, 'initially');
                expect(await mailbox.ask(Bank.address, {
                    type: 'Transfer',
                    from: 'Alice',
                    reference: 'first',
                    to: 'Bob',
                    amount: 60
                })).to.eql({type: 'Succeeded', reference: 'first'});
                await assertBalances(40, 60, 'after transfer');
                expect(await mailbox.ask(Bank.address, {
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

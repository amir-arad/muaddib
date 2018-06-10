import {expect, plan} from "./testkit/chai.spec";
import {Actor, ActorContext, Address, Mailbox, Message, System} from "../src";

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

                onReceive(message: Message<WhoToGreet | Greet>) {
                    const {body, from} = message;
                    if (body.type === 'WhoToGreet') {
                        this.greeting = "hello, " + body.who;
                    } else if (body.type === 'Greet' && this.ctx.from) {
                        // Send the current greeting back to the sender
                        this.ctx.send(this.ctx.from, {type: 'Greeting', message: this.greeting});
                    } else {
                        console.error(new Error('dropped message').stack);
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

            // catch the next message that will arrive at the mailbox
            let message = mailbox.getNext();

            // Ask the 'greeter for the latest 'greeting'
            // Reply should go to the "actor-in-a-box"
            mailbox.send(Greeter.address, {type: 'Greet'});
            expect((await message).body, '1st message').to.eql({type: 'Greeting', message: 'hello, muadib'});

            // Change the greeting and ask for it again
            system.send(Greeter.address, {type: 'WhoToGreet', who: 'system'});

            message = mailbox.getNext();
            mailbox.send(Greeter.address, {type: 'Greet'});
            expect((await message).body, '2nd message').to.eql({type: 'Greeting', message: 'hello, system'});
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

                async onReceive(message: Message<ChangeBalance | CheckBalance | SetBalance>) {
                    const {body, from} = message;
                    const oldBalance = this.balance;
                    try {
                        if (body.type === 'SetBalance') {
                            // simulate async processing
                            await randomDelay();
                            this.balance = body.balance;
                        } else if (body.type === 'ChangeBalance') {
                            // simulate async processing
                            await randomDelay();
                            this.balance += body.delta;
                        } else if (body.type === 'CheckBalance' && this.ctx.from) {
                            this.ctx.send(this.ctx.from, {type: 'Balance', balance: this.balance});
                        } else {
                            console.error(new Error('dropped message').stack);
                        }
                    } finally {
                        const reference = (body as any).reference;
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
                system.log.subscribe(m => console.log(JSON.stringify(m)));

                await system.actorOf(Account, {id: 'alice', balance: 0});
                const alice = Account.address({id: 'alice'});

                const mailbox = new Mailbox(system);

                await mailbox.reqRes(alice, {
                    type: 'ChangeBalance',
                    delta: 150,
                    reference: 'fooo'
                }, res => res.body.type === 'Succeeded');

                let balanceMsg = mailbox.reqRes(alice, {type: 'CheckBalance'}, res => res.body.type === 'Balance');
                expect((await balanceMsg).body, '1st balance').to.have.property('balance', 150);

                system.send(alice, {type: 'ChangeBalance', delta: -100});
                system.send(alice, {type: 'SetBalance', balance: 123});

                balanceMsg = mailbox.reqRes(alice, {type: 'CheckBalance'}, res => res.body.type === 'Balance');
                expect((await balanceMsg).body, '2nd balance').to.have.property('balance', 123);
            }));

            it('plugins lazy loading, prototype and singleton', plan(6, async () => {
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

                    async onReceive(message: Message<OpenAccount | Transfer | CheckBalance>) {
                        const {body, from} = message;
                        if (body.type === 'OpenAccount') {
                            await this.ctx.system.actorOf(Account, {id: body.name, balance: body.balance});
                        } else if (body.type === 'CheckBalance' && from) {
                            // forward the request to the account actor
                            this.ctx.system.send(Account.address({id: body.name}), {type: 'CheckBalance'}, from);
                        } else if (body.type === 'Transfer') {
                            this.transfer(body, from);
                        } else {
                            console.error(new Error('dropped message').stack);
                        }
                    }

                    private async transfer(body: Transfer, from?: Address) {
                        // create a new actor address to manage the transfer
                        const manager = new Mailbox(this.ctx.system, `Transfer:${body.reference}`);
                        // send deduction request to the 'from' side
                        const deductionResult = await manager.reqRes(Account.address({id: body.from}), {
                            type: 'ChangeBalance',
                            reference: body.reference,
                            delta: -body.amount
                        });
                        if (deductionResult.body.type === 'Succeeded') {
                            this.ctx.system.send(Account.address({id: body.to}), {
                                type: 'ChangeBalance',
                                delta: body.amount,
                                reference: body.reference
                            }, from);
                        } else if (deductionResult.body.type === 'Rejected') {
                            // report rejection
                            from && this.ctx.system.send(from, deductionResult.body);
                        } else {
                            console.error(new Error('dropped message').stack);
                        }
                    }
                }

                async function assertBalances(alice: number, bob: number, msg: string) {
                    const aliceBalanceMsg = mailbox.reqRes(Bank.address, {
                        type: 'CheckBalance',
                        name: 'Alice'
                    }, res => res.body.type === 'Balance');
                    expect((await aliceBalanceMsg).body, `Alice balance ${msg}`).to.have.property('balance', alice);
                    const bobBalanceMsg = mailbox.reqRes(Bank.address, {
                        type: 'CheckBalance',
                        name: 'Bob'
                    }, res => res.body.type === 'Balance');
                    expect((await bobBalanceMsg).body, `Bob balance ${msg}`).to.have.property('balance', bob);
                }

                const system = new System();
                //   system.log.subscribe(m => console.log(JSON.stringify(m)));
                await system.actorOf(Bank);
                system.send(Bank.address, {type: 'OpenAccount', name: 'Alice', balance: 100});
                system.send(Bank.address, {type: 'OpenAccount', name: 'Bob', balance: 0});
                const mailbox = new Mailbox(system);
                await assertBalances(100, 0, 'initially');
                await mailbox.reqRes(Bank.address, {
                    type: 'Transfer',
                    from: 'Alice',
                    reference: 'first',
                    to: 'Bob',
                    amount: 60
                }, res => res.body.type === 'Succeeded');
                await assertBalances(40, 60, 'after transfer');
                await mailbox.reqRes(Bank.address, {
                    type: 'Transfer',
                    from: 'Alice',
                    reference: 'second',
                    to: 'Bob',
                    amount: 60
                }, res => res.body.type === 'Rejected');
                await assertBalances(40, 60, 'after rejected transfer');
            }));
        });
    });
});

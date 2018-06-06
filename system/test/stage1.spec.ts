import {expect, plan} from "./testkit/chai.spec";
import {first} from 'rxjs/operators';
// import {expect} from "chai";
import {Actor, Mailbox, Message} from "../src";


describe('system', () => {
    describe('stage 1 - single vm, shallow plugins demo app', () => {
        it('load two plugins and have them all find and communicate with each other', plan(2, async () => {
            // demonstrate akka's hello world flow in the system
            // https://github.com/typesafehub/activator-hello-akka/blob/master/src/main/scala/HelloAkkaScala.scala
            class WhoToGreet {
                constructor(public who: string) {
                }
            }

            class Greet {
            }

            class Greeting {
                constructor(public message: string) {
                }
            }

            class Greeter extends Actor<WhoToGreet | Greet> {
                greeting = "";

                protected onReceive(message: Message<WhoToGreet | Greet>): void | Promise<void> {
                    const {body, from} = message;
                    if (body instanceof WhoToGreet) {
                        this.greeting = "hello, " + body.who;
                    } else if (body instanceof Greet && from) {
                        // Send the current greeting back to the sender
                        this.send(from, new Greeting(this.greeting));
                    } else {
                        this.unhandled(message);
                    }
                }
            }

            const ADDRESS = 'greeter';

            // Create the 'greeter' actor
            const greeter = new Greeter(ADDRESS);
            // Tell the 'greeter' to change its 'greeting' message
            Actor.send(ADDRESS, new WhoToGreet("muadib"));

            // Create the "actor-in-a-box"
            const mailbox = new Mailbox('1234');

            // Ask the 'greeter for the latest 'greeting'
            // Reply should go to the "actor-in-a-box"
            mailbox.send(ADDRESS, new Greet());

            // Wait for the reply with the 'greeting' message
            let message = await mailbox.incoming.pipe(first()).toPromise();
            expect(message.body, '1st message').to.be.instanceOf(Greeting).and.to.have.property("message", "hello, muadib");

            // Change the greeting and ask for it again
            Actor.send(ADDRESS, new WhoToGreet("system"));

            mailbox.send(ADDRESS, new Greet());
            message = await mailbox.incoming.pipe(first()).toPromise();
            expect(message.body, '2nd message').to.be.instanceOf(Greeting).and.to.have.property("message", "hello, system");
        }));

        xit('plugins as prototype and singleton', plan(1, () => {

        }));
    });
});

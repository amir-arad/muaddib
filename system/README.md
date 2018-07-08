# muadib system

fullstack plugins framework

### project features
 - load plugins and have them all find and communicate with each other
 - plugins as prototype and singleton

## developer documentation
how to build and test:
 - clone the repository
 - in the cloned folder, run `npm install`
 - run `npm test` to build and test the code in both nodejs and browser

how to debug (browser):
 - run `npm start` to run a development server
 - open `http://localhost:8081/test.bundle` to run live tests that will update while you change the source code

## About 
Muad'dib is a control layer for modern day TypeScript and Javascript applications. 
It enables communication and coordination between threads and across origin boundaries, and encourages usage of the best OOP and IoC principles.

## Philosophy
Muad'dib is developed with these goals:
1. allow TypeScript developers to build a control layer for elastic applications that spawns multiple VMs quickly and easily
1. adhere to [the SOLID principles](https://en.wikipedia.org/wiki/SOLID) and facilitate it
1. offer simple, powerful, separately replaceable tools that scale well in complexity and work nicely together.
1. offer a lenient mix of paradigms leaving the risks and freedom with the developer to make ad-hoc choices.

### concepts

 - IoC container
 see [the current state of dependency inversion in javascript](http://blog.wolksoftware.com/the-current-state-of-dependency-inversion-in-javascript) 
 Muad'dib's dependencies are indexed by contract keys (symbols), can be of any javascript value type, and are available through the `System` in which they were registered. 
 Muad'dib currently only registers instances for injection (not factories) and allows injecting more than one dependency of the same contract symbol.
 
 - Actor  
 From [Akka documentation](https://doc.akka.io/docs/akka/2.5/general/actor-systems.html):
 > Actors are objects which encapsulate state and behavior, they communicate exclusively by exchanging messages which are placed into the recipient’s mailbox
 
 From [wikipedia](https://en.wikipedia.org/wiki/Actor_model):
 > (...) the universal primitives of concurrent computation. In response to a message that it receives, an actor can: make local decisions, create more actors, send more messages, and determine how to respond to the next message received. Actors may modify their own private state, but can only affect each other through messages (avoiding the need for any locks).
 
 Muad'dib's actors are all the above, but are not the only design model in the system. two actors in the same `System` can share state simply by sharing dependencies.
 
 - System
 A container for a single [origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) and [thread](https://www.w3schools.com/html/html5_webworkers.asp)
 Facilitates actors and enables them to:
 1. get dependencies (see `IoC container`)
 2. receive messages from any other actor in the system or any connected system, one at a time
 3. ability to create other actors in the same system
 and more
 
  - actor definition
 - actor ref
 - context
 - ask
 - root context (context.run, system.run)
 - weak coupling based on target
 - cluster

## parts
 - IoC container
 a [dependency inversion](http://blog.wolksoftware.com/the-current-state-of-dependency-inversion-in-javascript) contract and naive implementation.
 .

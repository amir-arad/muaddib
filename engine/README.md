# filesystem implementation over the actor system

Sync file system over the actor system

### project exports
 - an actor to run on node which talks to actual FS
 - a plugin implementing sync API while communicating with the actor

## developer documentation
how to build and test:
 - clone the repository
 - in the cloned folder, run `npm install`
 - run `npm test` to build and test the code in both nodejs and browser

how to debug (browser):
 - run `npm start` to run a development server
 - open `http://localhost:8080/test.bundle` to run live tests that will update while you change the source code

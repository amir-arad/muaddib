# JSX Editor Architecture

The JSX editor architecture is an architecture guided by the idea of a very light core with many plugins.

a feature request would typically be answered by creating/fixing multiple plugins across the editor.

For instance An “Add Component” panel plugin can actually be composed of:
- The visual panel
- preview plugin for generating thumbnails
- Backend (node/worker) code for finding components across your project
- Backend (node/worker) code for inserting a component to the code model
- Wix-curated component service

Allowing any team in wix to create each of these parts will allow us to create small teams that sit well with wix philosophy.

These plugins APIs for use in other plugins ( for instance the Files plugin exposes a store of available per file actions)

## Core concepts

#### Feature
A group of plugins registered together to enable one or more user stories

### Deployments:
The editor will be packed as:
 - Hosted IDE
 - Local IDE
 - Plugin to Existing IDEs
 - Command-line-tool

### JS runtime environments.
The editor will allow plugins to run code in different js-runtime environments

#### Backend
Source of truth for the user project.
Should do most of the heavy lifting.
Can be used by many editor windows.
mostly composed of universal javascript, specific environment-dependent plugins can be implemented for either nodejs or web-worker


#### Main
GUI layer of the editor.
Opened in a browser

#### User Browser Spaces

User browser spaces are browser windows ( mostly implemented through Iframes ) running user code. They can be created by plugins, given a unique name (i.e. preview) and plugged into by other plugins

these will normaly run the users components and client side tests

####  Node Spaces

Node user spaces are node processes running user code. They can be created by plugins, given a unique name (i.e. preview) and plugged into by other plugins.

these will normaly run the users application business logic backend code






##` core APIs

the core offers the following services:

 - plugin registry
 - defining new plugin registries ( for extendable plugins )
 - Ability to create plugable user spaces
 - Ability to create plugable user backend spaces
 - Communication channel across scopes
 - File system abstraction
 - Auth abstraction
 - Command system












# Plugin hooks


there are many types of plugins




- backend-service
- main-service
- panel
- serializable command
- language support (compiler and dependencies)
- language intelligence ( intellisense )
- ts compiler transformer
- stylable compiler trasformer
- module system hook
- preview renderer ( react and stylable for starters )
- preview overlay plugin
- preview element overlay plugin
- backend extra language service (such as add node)
- add panel plugins
- property panel plugins

each of these have their own APIs for plugability and enviornment considirations.

## Environment considirations

### Backend scope

Backend code can be run either in worker or node. this means neither DOM APIs or nodejs APIS are available.
specific plugins that need nodeJS enviornemt can register only for it, but they should offer a worker version as a fallback

### Main scope

Main scope code runs in the browser window.

that means the editor and all its plugins share the same thread.

- all plugins and the editor must use the same version for all 3rd party singleton libraries (aka React)


### User scope (preview)

user scope code runs in the same iframe as the users code

- we need to keep this code down to a minimum
- this code must not be CPU intensive
- we must not allow this code to use singleton 3rd party libraries ( aka react);

## plugin APIS

### **Panels**

panels run in the **Main scope**.

In order to qualify as a panel you must implement the base panel API.

panels are react components with few extra capabilities:




#### considrations when writing a panel:

 - When defining a panel we must consider what ID should be considered when deciding wether to focus an existing instance or open a new one ( code editor tabs are focused instead of opened when its the same file path, filepanel is always focused )
 - **do we see any exampe of multi instance panel not centered around a file? ( maybe preview is cenetered on export? )**

### **SerializableCommands**

serializable commands run in the **Backend scope**

they are business logic pieces who's parameters can be serilized.
they can be executed from any scope in the editor
they can interact with the stores and backend services.

In order to qualify as a SerializableComands you must implement the base Serializable API.


### **language support (compiler and dependencies)**

LanguageSupport plugins run in the **Backend scope**

LanguageSupport plugins allow adding support for new languages to the editor.

this means supporting compileFile, and getFileDependencies

### **language intelligence (intellisense)**

LanguageIntelligence plugins run in the **Backend scope**

LanguageSupport plugins allow adding support for new languages to the code-editor.

this means supporting methods such as: getCompletionsAtPos, getDiagnostics. etc..



### **ts compiler transformer**

ts compiler transformer plugins run in the **Backend scope**

ts compiler transformer allow instrumenting typescript code when its compiled for the different scopes.


### **stylable compiler transformer**

stylable compiler transformer plugins run in the **Backend scope**

stylable compiler transformer allow instrumenting stylable code when its compiled for the different scopes.



### **module system hooks**

module system hook plugins run in the **User scope**

module system hooks allow instrumenting 3rd party code when its required for the different scopes.


### **preview renderer ( react and stylable for starters )**

preview renderer plugins run in the **User scope**

Preview renderer plugins allow rendering different kinds of assets visually in preview.

while this is easy to imagine for a react/vue component, it should also be done for functions, consts etc..


### **preview overlay plugin**

preview renderer plugins run in the **Main scope**


# Preview panel

the Preview panel runs user code in an iframe and interacts with it.

it relies on metadata from the meta data store.

its navigation state is reflected in its "address bar" like control


a store should keep track of the currently focused preview panel and selection in it
( as style and simulation panels display according to that info)



## Modes of operations

### Eval module

url: eval:/src/myfile.tsx

simplest of the modes. evals a module in the preview iframe ( will only see that modules direct interaction with the dom ).
this works well for application bootstrap files


### Gallery

renders a gallery of exports from one or more file, uses a renderer plugin according to their metadata type.

this allows:
 - Showing exports of a module - repl:/src/myfile.tsx
 - viewing a stylable theme - repl:/src/mytheme.st.css
 - viewing a list of all components, all functions etc. in a project - type:components

 clicking an item in the gallery will go to the render export mode for that export if a renderer plugin exists


### Render Export
url: repl:/src/myfile.tsx>export-name

renders one export of one module.
typically a react component.
uses its meta data.
this is the main editing mode of the editor.



clicking a node on stage will select it

### Run User App
url: node:/about/me

runs user node and navigates to it with the url.










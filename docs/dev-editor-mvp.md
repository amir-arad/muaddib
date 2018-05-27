# Dev Editor MVP

this document outlines the feature-set to be implemented in the DEV-editor MVP.

at the end of this document are sub-MVP products that can still be usefull to wix

the MVP editor allows creating Applications hosted on wix-cloud. it can run localy or hosted.
- it runs over a user project defined as a directory in a file system.
- it allows you to preview your app and components.
- it allows you to edit them through a code editor ( or local IDE when local ).
- it allows you to edit styles.
- it allows deploying the app to the wix-cloud.


## Deployments

 - Hosted
     - over git FS
     - uses wix-cloud for node user spaces?
 - local - over fs or IDE fs


## Editor CLI interface
editor can be run as a command prompt over a user project in FS
- allows reading/changing files
- allows running user code in a node-user-scope
- allows deploying user code
- allows extracting meta-data from user project
    - meta-data store is filled by running user written metadata code
    - where possible meta-data store will be moved to be filled from automated static scanning of user code
    - meta-data fields per module export:
        - title
        - description
        - type ( used for choosing preview renderer )
        - props simulations ( for type component )
        - available styles ( for type component )
        - TBD -props json schema ( for type component )
        - TBD -arguments json schema ( for type function )

## GUI-Editor

### general

the GUI editor reflects the user files in a number of ways:
- react components are hot-reloaded.

it also has some GUI state
- open panels
- preview panels state
    - focused preview panel
    - element selection

### File-panel
- allows running file centric commands
    - allows opening a file for preview.
    - allows opening a file in code editor
- updates from real FS

### preview panel

- allows viewing whole apps
- allows viewing a stylable theme
- allows viewing react components
- allows highlighting elements

### style panel
component variants are component styles saved in an st.css file.
this panel works on current focused preview panel ( and selection inside it )
- allows editing component variants
- creating new variants
- choosing from existing variants
- highlights edited part on stage

### simulation panel

- allows selecting between component simulations, (saved in a meta-data file).
- creating a meta-data file if one does not exist.
- allows selecting between component style variants.

### Add panel
- allows adding components to JSX (through drag and drop to source)


### code editor
- code editor panel
- language services


# Sub MVP possible products to release

## stylable style editor
allows the studio and UX to manage component styles
 - does not handle adding components
 - does not handle hosting/deploying
 - does not run node-code-scopes
 - no code editor
 - no meta-file creation and editing

 ## local editor

 - no hosted version
 - no code editor

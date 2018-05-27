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

 - Hosted over git FS and wix cloud
 - local - over fs or IDE fs


## Editor CLI interface
- allows running editor on project
- allows reading/changing files
- allows running user code in a node-user-scope
- allows deploying user code
- allows extracting meta-data from user project

## GUI-Editor

### general

the GUI editor reflects the user files in a number of ways:
- react components are hot-reloaded.

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

 - does not handle adding components

 ## local editor

 - no hosted version
 - no code editor

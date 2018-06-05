# Dev Core MVP

this document outlines the feature-set of a framework that enabled building dev-tools, 
specifically an editor, by composing separate, reusable plugins.

## vms 
run one or more of the following threads working together as one application:
 - nodeJs
 - browser window
 - browser worker

## stage 1 - single vm, shallow plugins demo app
 1. load two plugins and have them all find and communicate with each other
 2. plugins as prototype and singleton
### demo app - log to console all active plugins and who sent what to whom. 

## stage 2 - 2nd level plugins
 1. have a plugin fetch objects array that implement its extention API (2nd level plugins) and use them for its BL
 2. 2nd level plugins can communicate with 1st level plugins back and forth.
### demo app - log to console all 2nd level plugin registrations to 1st level plugins

## stage 3 - multiple vms
 1. load a plugin in each of the 3 vms and have them all communicate with each other
 2. have a plugin fetch objects that implement its extention API (2nd level plugins) and use them for its BL
### demo app - render to window instead of logging to console

## stage 4 - iframes
 1. load new iframe by command (more than one)
 2. load pre-configured pack of plugin + extentions in the new vm
 
## stage 5 - user code
 1. filesystem over local FS
 2. run user code in new iframe on command (eval)

## stage 6 - complex user app
 1. run user code with dependencies in new iframe on command (module system)

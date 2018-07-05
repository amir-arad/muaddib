import { ExecutionContext } from 'muadib-system';


export type ScopeInit<CONFIG> = (ctx:ExecutionContext<CONFIG>)=>Promise<void> | void;
export type Register<MULTISYSTEM, SCOPE extends keyof MULTISYSTEM> = (scope:SCOPE, scopeInit:ScopeInit<MULTISYSTEM[SCOPE]>)=> void;



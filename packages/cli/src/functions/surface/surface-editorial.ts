import type { SurfaceEntryPointId, SurfaceStep } from './surface-doc.types.js'

/**
 * This file is prose, not derived data. Every other field of the surface doc is
 * computed from the generated output, because the barrel is the source of truth
 * for what a leaf exports — but which of the six steps a leaf belongs to, and
 * the sentence that says what it is for, is a judgement no parser can make.
 *
 * A leaf with no entry here fails the build rather than defaulting to something
 * bland, so a new leaf cannot ship undocumented.
 */

export type LeafEditorial = {
  step: SurfaceStep
  summary: string
}

export type EntryPointEditorial = {
  job: string
  summary: string
}

/**
 * Keyed by leaf name — the segment after `#pikku/`. Shared by the application
 * and addon entry points, which differ in which leaves they have rather than in
 * what a leaf is for.
 */
export const LEAF_EDITORIAL: Record<string, LeafEditorial> = {
  function: {
    step: 'create a function',
    summary:
      'The function definers every wiring eventually points at, along with the middleware and permission types they are typed against.',
  },
  error: {
    step: 'enhance it',
    summary:
      'The errors your functions throw and the HTTP status each one maps to, so a thrown error is part of the contract rather than a stack trace.',
  },
  variables: {
    step: 'enhance it',
    summary:
      'Configuration a function reads through the variables service, declared once so a deployment can be checked for what it is missing.',
  },
  secrets: {
    step: 'enhance it',
    summary:
      'Secrets a function can use without ever holding, declared here and resolved by the secrets service at runtime.',
  },
  credentials: {
    step: 'enhance it',
    summary:
      'Third-party credentials — OAuth2 grants and API keys — declared so the runtime can acquire, refresh and inject them.',
  },
  addon: {
    step: 'enhance it',
    summary:
      'The addons this project installs and the typed services they contribute to every function.',
  },
  http: {
    step: 'wire it up',
    summary:
      'Wires a function to an HTTP route, with the path parameters checked against the function input.',
  },
  channel: {
    step: 'wire it up',
    summary:
      'Wires a function to a websocket channel, its message routes and its pub/sub topics.',
  },
  queue: {
    step: 'wire it up',
    summary:
      'Wires a function as a queue worker, so a job on the queue runs the same handler an HTTP route would.',
  },
  scheduler: {
    step: 'wire it up',
    summary: 'Wires a function to a cron expression to run it on a schedule.',
  },
  trigger: {
    step: 'wire it up',
    summary:
      'Wires a function to an event a source emits, rather than to a caller that asks for it.',
  },
  gateway: {
    step: 'wire it up',
    summary:
      'Wires a function behind a gateway that receives requests on behalf of another system.',
  },
  mcp: {
    step: 'wire it up',
    summary:
      'Wires a function as an MCP tool, resource or prompt for a model to call.',
  },
  cli: {
    step: 'wire it up',
    summary:
      'Wires a function as a command, with its flags and arguments derived from the function input.',
  },
  auth: {
    step: 'guard it',
    summary:
      'The project session type every authenticated function is typed against, and the gate that produces it.',
  },
  scopes: {
    step: 'guard it',
    summary:
      'The scopes a caller can hold and the roles that grant them, gating a call outside the permission pool.',
  },
  workflow: {
    step: 'orchestrate it',
    summary:
      'Composes functions into a durable workflow whose steps survive a restart and retry on their own.',
  },
  agent: {
    step: 'orchestrate it',
    summary:
      'Defines an AI agent, the tools it may call and the scorers that judge what it did.',
  },
  scenarios: {
    step: 'test it',
    summary:
      'Drives features and scenarios against a real running server, in the vocabulary a user would use.',
  },
}

/**
 * The ecosystem entry point is `@pikku/core` itself, whose exports map carries
 * far more subpaths than anyone building on top of Pikku needs to meet. Unlike
 * the application and addon leaves — where the generated tree decides the list
 * — the selection here *is* editorial, so this map doubles as the filter.
 */
export const ECOSYSTEM_LEAF_EDITORIAL: Record<string, LeafEditorial> = {
  './function': {
    step: 'create a function',
    summary:
      'The core function runner and the config shapes every generated definer is a thin typed wrapper around.',
  },
  './types': {
    step: 'create a function',
    summary:
      'The service, session and wiring types the rest of the framework is written against.',
  },
  './errors': {
    step: 'enhance it',
    summary:
      'The error base classes and the registry mapping an error onto a status code.',
  },
  './services': {
    step: 'enhance it',
    summary:
      'The service interfaces a runtime has to satisfy, and the local implementations that satisfy them in development.',
  },
  './middleware': {
    step: 'enhance it',
    summary:
      'The middleware runner, the priorities it honours and the middleware shipped with the framework.',
  },
  './schema': {
    step: 'enhance it',
    summary:
      'Schema registration and validation, the layer that makes a function reject input before it runs.',
  },
  './state': {
    step: 'enhance it',
    summary:
      'The registry every wiring writes into at import time and every runtime reads back out.',
  },
  './secret': {
    step: 'enhance it',
    summary: 'Declaring a secret and resolving it through the secrets service.',
  },
  './variable': {
    step: 'enhance it',
    summary:
      'Declaring configuration and reading it through the variables service.',
  },
  './credential': {
    step: 'enhance it',
    summary:
      'Declaring a third-party credential and the grant flow that acquires it.',
  },
  './http': {
    step: 'wire it up',
    summary:
      'The HTTP wiring registry, the request and response abstractions, and the runner a server adapter calls.',
  },
  './channel': {
    step: 'wire it up',
    summary:
      'The channel registry and the connection runner, in both its stateful and serverless forms.',
  },
  './queue': {
    step: 'wire it up',
    summary:
      'The queue worker registry and the shape a queue backend implements.',
  },
  './scheduler': {
    step: 'wire it up',
    summary: 'The scheduled task registry and the runner a scheduler drives.',
  },
  './trigger': {
    step: 'wire it up',
    summary: 'The trigger registry and the sources that emit into it.',
  },
  './gateway': {
    step: 'wire it up',
    summary: 'The gateway registry and the request handling it delegates.',
  },
  './mcp': {
    step: 'wire it up',
    summary:
      'The MCP tool, resource and prompt registries, and the server runner behind them.',
  },
  './cli': {
    step: 'wire it up',
    summary:
      'The command registry, the argument parser and the channel a long-running command talks over.',
  },
  './rpc': {
    step: 'wire it up',
    summary:
      'Calling one function from another, in-process or across a deployment boundary.',
  },
  './scope': {
    step: 'guard it',
    summary:
      'The scope registry and the check that gates a call on the scopes a caller holds.',
  },
  './workflow': {
    step: 'orchestrate it',
    summary:
      'The workflow engine: steps, persistence, retries and the timeline a run leaves behind.',
  },
  './agent': {
    step: 'orchestrate it',
    summary:
      'The agent runtime, its tool dispatch and the approval gate in front of it.',
  },
  './scenario': {
    step: 'test it',
    summary:
      'The scenario runtime that drives features against a running server.',
  },
  './testing': {
    step: 'test it',
    summary:
      'Helpers for standing a wiring up in a test without a server in front of it.',
  },
}

export const ENTRY_POINT_EDITORIAL: Record<
  SurfaceEntryPointId,
  EntryPointEditorial
> = {
  app: {
    job: 'build an app',
    summary:
      'This is the door you open to build a service. The CLI generates a barrel per concern into .pikku, package.json maps #pikku onto it, and everything below runs in the order you actually meet it while building — write a function, give it what it needs, decide how the world reaches it, say who may call it, compose it, then drive the whole thing in a test.',
  },
  addon: {
    job: 'build an addon',
    summary:
      'An addon declares functions and contracts; the host application decides how the world reaches them. The same #pikku barrels are generated, minus every wiring — an addon that called wireHTTP would be registering a route in a registry it does not own.',
  },
  ecosystem: {
    job: 'build on Pikku itself',
    summary:
      'Below the generated barrels sits @pikku/core, which is what you import when you are writing a runtime adapter, a service implementation or a package other Pikku projects depend on, rather than an application of your own.',
  },
}

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
  /**
   * The skill that teaches this door, or `null` where the generated page says
   * everything there is. Required so that adding a leaf forces the question
   * rather than quietly shipping a door nothing teaches.
   */
  skill: string | string[] | null
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
  setup: {
    step: 'create a function',
    skill: 'pikku-services',
    summary:
      'The three factories a project declares exactly once — its config, its singleton services and its per-wire services. An addon declares the same three in its own flavour, handed the logger, variables and secrets the host application already built. Everything else on this page is imported by features; these are imported by bootstrap and then left alone.',
  },
  function: {
    step: 'create a function',
    skill: 'pikku-concepts',
    summary:
      'The function definers every wiring eventually points at, and the types they are written against. A function is handed services, then its input, then the wire — and the wire is where the request lives: `session`, `setSession`, `clearSession`, `http`, `channel`, `rpc`. None of those are exports, so they are not listed here; destructure them from the third argument.',
  },
  middleware: {
    step: 'enhance it',
    skill: 'pikku-middleware',
    summary:
      'Middleware is one concept regardless of what it ends up attached to, so it is one import: define it here, then register it globally, against a tag, or against an HTTP route or channel.',
  },
  error: {
    step: 'enhance it',
    skill: null,
    summary:
      'The errors your functions throw and the HTTP status each one maps to, so a thrown error is part of the contract rather than a stack trace.',
  },
  variables: {
    step: 'enhance it',
    skill: 'pikku-services',
    summary:
      'Configuration a function reads through the variables service, declared once so a deployment can be checked for what it is missing.',
  },
  secrets: {
    step: 'enhance it',
    skill: 'pikku-services',
    summary:
      'Secrets a function can use without ever holding, declared here and resolved by the secrets service at runtime.',
  },
  credentials: {
    step: 'enhance it',
    skill: null,
    summary:
      'Third-party credentials — OAuth2 grants and API keys — declared so the runtime can acquire, refresh and inject them.',
  },
  addon: {
    step: 'enhance it',
    skill: 'pikku-addon',
    summary:
      'Installs an addon into this application, on its own or over rpc against a remote one.',
  },
  http: {
    step: 'wire it up',
    skill: 'pikku-wiring',
    summary:
      'Wires a function to an HTTP route, with the path parameters checked against the function input.',
  },
  channel: {
    step: 'wire it up',
    skill: 'pikku-wiring',
    summary:
      'Wires a function to a websocket channel, its message routes and its pub/sub topics.',
  },
  queue: {
    step: 'wire it up',
    skill: 'pikku-wiring',
    summary:
      'Wires a function as a queue worker, so a job on the queue runs the same handler an HTTP route would.',
  },
  scheduler: {
    step: 'wire it up',
    skill: 'pikku-wiring',
    summary: 'Wires a function to a cron expression to run it on a schedule.',
  },
  trigger: {
    step: 'wire it up',
    skill: 'pikku-wiring',
    summary:
      'Wires a function to an event a source emits, rather than to a caller that asks for it.',
  },
  gateway: {
    step: 'wire it up',
    skill: 'pikku-wiring',
    summary:
      'Wires a function behind a gateway that receives requests on behalf of another system.',
  },
  mcp: {
    step: 'wire it up',
    skill: 'pikku-wiring',
    summary:
      'Wires a function as an MCP tool, resource or prompt for a model to call.',
  },
  cli: {
    step: 'wire it up',
    skill: 'pikku-wiring',
    summary:
      'Wires a function as a command, with its flags and arguments derived from the function input.',
  },
  auth: {
    step: 'guard it',
    skill: 'pikku-auth',
    summary:
      'Who may call a function, and what the call is made with: permissions that see the request, auth gates that run before it, and the credentials a function borrows rather than holds.',
  },
  scopes: {
    step: 'guard it',
    skill: 'pikku-auth',
    summary:
      'The scopes a caller can hold and the roles that grant them, gating a call outside the permission pool.',
  },
  workflow: {
    step: 'orchestrate it',
    skill: 'pikku-workflow',
    summary:
      'Composes functions into a durable workflow whose steps survive a restart and retry on their own.',
  },
  agent: {
    step: 'orchestrate it',
    skill: 'pikku-agent',
    summary:
      'Defines an AI agent, the tools it may call and the scorers that judge what it did.',
  },
  scenarios: {
    step: 'test it',
    skill: 'pikku-scenario',
    summary:
      'Drives features and scenarios against a real running server, in the vocabulary a user would use.',
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
      'An addon declares functions and contracts; the host application decides how the world reaches them. The same barrels are generated under #pikku/addon/*, minus every wiring — an addon that called wireHTTP would be registering a route in a registry it does not own.',
  },
}

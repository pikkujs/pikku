import { z } from 'zod'
import { pikkuFunc, pikkuSessionlessFunc, ref } from '#pikku/function'
import { pikkuAgent } from '#pikku/agent'
import { wireAddon, wireRemoteAddon } from '#pikku/addon'
import { wireHTTP, wireHTTPRoutes } from '#pikku/http'
import { defineScreens } from '@pikku/core/addon'
import { defineCredential } from '@pikku/core/credential'
import { defineSecret } from '#pikku/secrets'
import { executeCLI } from '@pikku/core/cli'

// Examples for the CLI error pages PKU0xx to PKU4xx. This file is type-checked
// but never inspected or run; every wiring call sits inside a function so
// nothing registers at import time.

// ---------------------------------------------------------------------------
// Addons (PKU124, PKU152, PKU338-PKU346)
// ---------------------------------------------------------------------------

export const wireAddonOverrides = () => {
  // @snippet start ea-addon-secret-override
  // Maps the addon's own 'apiKey' secret onto a secret this app defines
  wireAddon({
    name: 'stripe',
    package: '@pikku/addon-stripe',
    secretOverrides: { apiKey: 'STRIPE_SECRET_KEY' },
  })
  // @snippet end ea-addon-secret-override
}

export const wireAddonNamespace = () => {
  // @snippet start ea-addon-namespace
  // `name` is the namespace: every function the addon exports becomes
  // available as `stripe:<functionName>`
  wireAddon({ name: 'stripe', package: '@pikku/addon-stripe' })
  // @snippet end ea-addon-namespace
}

export const wireAddonVersusRemote = () => {
  // @snippet start ea-addon-local-vs-remote
  // Runs locally: the package belongs in "dependencies"
  wireAddon({ name: 'stripe', package: '@pikku/addon-stripe' })

  // Runs on a remote host: the package belongs in "devDependencies"
  wireRemoteAddon({
    name: 'crm',
    package: '@acme/addon-crm',
    serverUrl: 'https://crm.example.com',
  })
  // @snippet end ea-addon-local-vs-remote
}

export const defineCrmCredential = () => {
  // @snippet start ea-define-crm-credential
  defineCredential({
    name: 'crmOAuth',
    displayName: 'CRM',
    description: 'OAuth connection to the CRM',
    type: 'singleton',
    schema: z.object({ accessToken: z.string() }),
  })
  // @snippet end ea-define-crm-credential
}

export const defineCrmSecret = () => {
  // @snippet start ea-define-crm-secret
  // `name` is what the wiring binds; `secretId` is the environment variable
  defineSecret({
    name: 'crmApiKey',
    displayName: 'CRM API Key',
    description: 'Server API key for the CRM',
    secretId: 'CRM_API_KEY',
    schema: z.string(),
  })
  // @snippet end ea-define-crm-secret
}

export const wireAddonPackageName = () => {
  // @snippet start ea-addon-package-name
  // `package` is the real name, exactly as published
  wireAddon({ name: 'admin', package: '@pikku/addon-admin' })
  // @snippet end ea-addon-package-name
}

export const wireRemoteAddonCredential = () => {
  // @snippet start ea-remote-addon-credential
  // 'crmOAuth' must match the `name` of a credential this project declares
  wireRemoteAddon({
    name: 'crm',
    package: '@acme/addon-crm',
    serverUrl: 'https://crm.example.com',
    auth: { credentialId: 'crmOAuth' },
  })
  // @snippet end ea-remote-addon-credential
}

export const wireRemoteAddonSecret = () => {
  // @snippet start ea-remote-addon-secret
  // 'crmApiKey' is the `name` of the declared secret, not its environment
  // variable ('CRM_API_KEY')
  wireRemoteAddon({
    name: 'crm',
    package: '@acme/addon-crm',
    serverUrl: 'https://crm.example.com',
    auth: { secretId: 'crmApiKey' },
  })
  // @snippet end ea-remote-addon-secret
}

export const wireAddonMcpList = () => {
  // @snippet start ea-addon-mcp-list
  // Only functions the addon publishes can be named here
  wireAddon({
    name: 'stripe',
    package: '@pikku/addon-stripe',
    mcp: ['chargeGet', 'chargeList'],
  })
  // @snippet end ea-addon-mcp-list
}

export const wireAddonMcpAll = () => {
  // @snippet start ea-addon-mcp-all
  // Offer whatever the addon itself declares as tool-shaped
  wireAddon({ name: 'stripe', package: '@pikku/addon-stripe', mcp: true })
  // @snippet end ea-addon-mcp-all
}

export const wireAddonExpose = () => {
  // @snippet start ea-addon-expose
  wireAddon({
    name: 'stripe',
    package: '@pikku/addon-stripe',
    expose: ['chargeGet'],
  })
  // @snippet end ea-addon-expose
}

export const wireAddonExposeInline = () => {
  // @snippet start ea-addon-expose-inline
  // `expose` is true, false or a list written out inline
  wireAddon({
    name: 'stripe',
    package: '@pikku/addon-stripe',
    expose: ['chargeGet', 'chargeList'],
  })
  // @snippet end ea-addon-expose-inline
}

// @snippet start ea-define-screens
export default defineScreens({
  title: 'Invoices',
  screens: [
    {
      path: '/',
      title: 'Invoices',
      nav: true,
      scopes: ['invoices:read'],
      component: () => import('./errors-a.example.js'),
    },
  ],
})
// @snippet end ea-define-screens

export const wireAddonWithoutUi = () => {
  // @snippet start ea-addon-no-ui
  // The package only ships functions, so there is no `ui`
  wireAddon({ name: 'stripe', package: '@pikku/addon-stripe' })
  // @snippet end ea-addon-no-ui
}

export const wireAddonWithUi = () => {
  // @snippet start ea-addon-ui
  // Mounts the screens the package declares with defineScreens
  wireAddon({ name: 'stripe', package: '@pikku/addon-stripe', ui: true })
  // @snippet end ea-addon-ui
}

// ---------------------------------------------------------------------------
// Function metadata (PKU124 node type, PKU154)
// ---------------------------------------------------------------------------

// @snippet start ea-node-config
export const processOrder = pikkuFunc({
  // `type` is one of 'trigger' | 'action' | 'end'
  node: { displayName: 'Process Order', category: 'orders', type: 'action' },
  func: async () => ({ processed: true }),
})
// @snippet end ea-node-config

// ---------------------------------------------------------------------------
// AI agents (PKU145, PKU146, PKU152, PKU153, PKU154, PKU156)
// ---------------------------------------------------------------------------

// @snippet start ea-agent-model
// The model is a literal, in `<provider>/<model>` form
export const supportAgent = pikkuAgent({
  name: 'support-agent',
  description: 'Helps customers with their orders.',
  goal: 'Help customers with their orders.',
  model: 'openai/gpt-4o-mini',
})
// @snippet end ea-agent-model

// @snippet start ea-agent-addon-tool
// `stripe:` is the `name` the addon was wired under
export const billingAgent = pikkuAgent({
  name: 'billing-agent',
  description: 'Answers billing questions',
  goal: 'Help the customer resolve a billing issue.',
  model: 'openai/gpt-4o-mini',
  tools: [ref('stripe:chargeGet')],
})
// @snippet end ea-agent-addon-tool

// @snippet start ea-agent-first-party-tool
// A function in this project is referenced without a namespace
export const ordersAgent = pikkuAgent({
  name: 'orders-agent',
  description: 'Answers questions about past orders',
  goal: 'Help the customer find and understand their orders.',
  model: 'openai/gpt-4o-mini',
  tools: [ref('listOrders')],
})
// @snippet end ea-agent-first-party-tool

// @snippet start ea-tool-description
export const listInvoices = pikkuFunc({
  title: 'List invoices',
  description:
    "Lists the signed-in user's invoices, most recent first. Use when the user asks about billing history, a specific charge, or an unpaid balance. Returns at most 50 invoices.",
  func: async ({ kysely }, _data: null, { session }) => {
    return kysely
      .selectFrom('order')
      .where('userId', '=', session.userId)
      .selectAll()
      .limit(50)
      .execute()
  },
})
// @snippet end ea-tool-description

// @snippet start ea-agent-provider-options
export const reasoningAgent = pikkuAgent({
  name: 'reasoning-agent',
  description: 'Works through harder support questions.',
  goal: 'Help the customer with their order.',
  model: 'anthropic/claude-sonnet-4-5',
  // An object literal of strings, numbers, booleans, arrays and objects
  providerOptions: {
    anthropic: {
      thinking: { type: 'enabled', budgetTokens: 2000 },
    },
  },
})
// @snippet end ea-agent-provider-options

// ---------------------------------------------------------------------------
// Wiring shape (PKU236 and friends)
// ---------------------------------------------------------------------------

export const wireTaggedRoute = () => {
  // @snippet start ea-http-tags
  // `tags` is an array of strings
  wireHTTP({
    method: 'post',
    route: '/api/users',
    tags: ['users', 'api'],
    func: pikkuSessionlessFunc({ func: async () => ({ ok: true }) }),
  })
  // @snippet end ea-http-tags
}

export const wireGreeting = () => {
  // @snippet start ea-http-func
  const greet = pikkuSessionlessFunc<{ name: string }, { message: string }>({
    func: async (_services, data) => ({ message: `Hello ${data.name}` }),
  })

  wireHTTP({
    method: 'post',
    route: '/api/greeting',
    func: greet,
  })
  // @snippet end ea-http-func
}

export const bootstrapCli = () => {
  // @snippet start ea-execute-cli
  // The program name must match the one given to wireCLI
  return executeCLI({
    programName: 'shop',
    args: process.argv.slice(2),
    createSingletonServices: async () => ({}) as never,
  })
  // @snippet end ea-execute-cli
}

// ---------------------------------------------------------------------------
// Function signatures (PKU410, PKU411, PKU498)
// ---------------------------------------------------------------------------

// @snippet start ea-services-destructured
// Only `kysely` is bundled for this function
export const findOrder = pikkuFunc({
  func: async ({ kysely }, { orderId }: { orderId: string }) => {
    return kysely
      .selectFrom('order')
      .selectAll()
      .where('orderId', '=', orderId)
      .executeTakeFirst()
  },
})
// @snippet end ea-services-destructured

// @snippet start ea-wires-destructured
// Only `rpc` is bundled for this function
export const findOrderViaRpc = pikkuFunc({
  func: async ({ kysely }, { orderId }: { orderId: string }, { rpc }) => {
    const order = await rpc.invoke('getOrder', { orderId })
    return { order, checkedAt: Date.now() }
  },
})
// @snippet end ea-wires-destructured

// @snippet start ea-static-import
import { randomUUID } from 'node:crypto'

// The import is resolved once, when the module loads
export const newReportId = pikkuSessionlessFunc({
  func: async () => {
    return { reportId: randomUUID() }
  },
})
// @snippet end ea-static-import

// @snippet start ea-lazy-service-setup
// A dynamic import in service setup runs once at startup, not per request
export const createCompressionServices = async (
  singletonServices: Record<string, unknown>
) => {
  const { gzipSync } = await import('node:zlib')
  return { ...singletonServices, compress: gzipSync }
}
// @snippet end ea-lazy-service-setup

// ---------------------------------------------------------------------------
// Schemas and types (PKU456, PKU463, PKU489-PKU491)
// ---------------------------------------------------------------------------

// @snippet start ea-exported-contract-type
// Exported, so the inspector can generate a schema for it
export type CreateOrderInput = {
  basketId: string
  shippingAddress: string
}

export const createOrderFromBasket = pikkuFunc<
  CreateOrderInput,
  { orderId: string }
>({
  func: async () => ({ orderId: 'order-1' }),
})
// @snippet end ea-exported-contract-type

// @snippet start ea-inline-contract-type
// An inline type has no name to resolve
export const createOrderInline = pikkuFunc<
  { basketId: string; shippingAddress: string },
  { orderId: string }
>({
  func: async () => ({ orderId: 'order-1' }),
})
// @snippet end ea-inline-contract-type

// @snippet start ea-exported-schema
// A named, exported variable: the CLI can import it by name
export const CreateTodoInput = z.object({ text: z.string() })

export const createTodo = pikkuFunc({
  func: async (_services, { text }) => ({ text }),
  input: CreateTodoInput,
})
// @snippet end ea-exported-schema

// @snippet start ea-schema-file
// todos.schemas.ts: schemas live alone
export const CreateTodoSchema = z.object({ text: z.string() })
// @snippet end ea-schema-file

export const wireTodoRoutes = () => {
  // @snippet start ea-wiring-file
  // todos.wiring.ts: wiring lives in a wiring file
  wireHTTPRoutes({
    routes: {
      createTodo: { method: 'post', route: '/todos', func: createTodo },
    },
  })
  // @snippet end ea-wiring-file
}

// @snippet start ea-wire-shape-schema
// The schema describes what is on the wire
export const CreateAssessmentInput = z.object({
  patientId: z.string(),
  when: z.string().datetime(),
})
// @snippet end ea-wire-shape-schema

// @snippet start ea-convert-in-function
// The conversion happens where the value is used
export const createAssessment = pikkuFunc({
  func: async (_services, { patientId, when }) => {
    const scheduledAt = new Date(when)
    return { patientId, scheduledAt: scheduledAt.toISOString() }
  },
  input: CreateAssessmentInput,
})
// @snippet end ea-convert-in-function

// @snippet start ea-schema-constraints
// Describable constraints instead of transforms
export const Constraints = {
  trimmed: z.string().trim().min(1), // `.trim()` is a check, not a transform
  count: z.number(), // send a number; don't accept a string and cast it
  tags: z.array(z.string()), // send an array; don't accept a joined string
}
// @snippet end ea-schema-constraints

// @snippet start ea-schema-output-date
// The output describes what the client receives, no transform needed
export const AssessmentOutput = z.object({
  id: z.string(),
  scheduledAt: z.date(),
})
// @snippet end ea-schema-output-date

// ---------------------------------------------------------------------------
// Database annotations (PKU480-PKU484)
// ---------------------------------------------------------------------------

// @snippet start ea-annotation-boolean
// The boolean type is intentional and acknowledged
export const annotationsBoolean = {
  'public.users': {
    created_at: { kind: 'boolean' },
  },
}
// @snippet end ea-annotation-boolean

// @snippet start ea-annotation-json
// A concrete type flows through the generated Kysely types
export const annotationsJson = {
  'public.users': {
    metadata: { kind: 'json', tsType: 'UserMetadata' },
  },
}
// @snippet end ea-annotation-json

// @snippet start ea-annotation-number
// A number column, with no string-only format
export const annotationsNumber = {
  'public.users': {
    age: { kind: 'number' },
  },
}
// @snippet end ea-annotation-number

// @snippet start ea-annotation-format
// No conflicting kind, so the column resolves to string and 'email' refines it
export const annotationsFormat = {
  'public.users': {
    email: { format: 'email' },
  },
}
// @snippet end ea-annotation-format

// @snippet start ea-annotation-hashed
// A password is verified, never recovered
export const annotationsHashed = {
  'public.users': {
    password: { classification: 'secret', form: 'hashed' },
  },
}
// @snippet end ea-annotation-hashed

// @snippet start ea-annotation-plain
// A replayable token, acknowledged as such
export const annotationsPlain = {
  'public.integrations': {
    apiToken: { classification: 'secret', form: 'plain' },
  },
}
// @snippet end ea-annotation-plain

// @snippet start ea-annotation-no-form
// No form on a numeric column
export const annotationsNoForm = {
  'public.users': {
    loginCount: { classification: 'private' },
  },
}
// @snippet end ea-annotation-no-form

// @snippet start ea-annotation-wrapped
// Ciphertext is text, and stays text
export const annotationsWrapped = {
  'public.users': {
    secretBlob: { classification: 'secret', form: 'wrapped' },
  },
}
// @snippet end ea-annotation-wrapped

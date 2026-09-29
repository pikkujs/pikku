import { describe, test, mock } from 'bun:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MantineProvider } from '@pikku/mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let credentialsMeta: Record<string, unknown> = {}
let projectMeta: Record<string, unknown> = {}

mock.module('../../context/PikkuMetaContext', () => ({
  usePikkuMeta: () => ({
    meta: { credentialsMeta, ...projectMeta },
    loading: false,
  }),
}))
mock.module('../../context/PikkuRpcProvider', () => ({
  usePikkuRPC: () => ({ invoke: async () => ({ statuses: {} }) }),
}))
mock.module('../../router', () => ({ useNavigate: () => () => {} }))
mock.module('../../context/PanelContext', () => ({
  usePanelContext: () => ({
    openTriggerSource: () => {},
    openTrigger: () => {},
  }),
}))
mock.module('../../hooks/usePanelUrl', () => ({ usePanelUrl: () => {} }))

const { WebhookSourceConfiguration } = await import('./WebhookSourcePanel')
const { TriggersListPanel } = await import('./TriggersListPanel')

const stripe = {
  name: 'stripe',
  method: ['post', 'put'] as ('post' | 'put')[],
  route: '/webhooks/stripe',
  events: ['invoice.paid', 'invoice.failed'],
  receive: 'stripeReceive',
  setup: 'stripeSetup',
}

const render = (
  node: React.ReactNode,
  secretSaved?: boolean,
  sources?: Record<string, unknown>[]
) => {
  const client = new QueryClient()
  if (sources) client.setQueryData(['trigger-sources'], sources)
  if (secretSaved !== undefined)
    client.setQueryData(
      ['credential-global-status', 'stripeWebhookSecret'],
      secretSaved
    )
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MantineProvider>{node}</MantineProvider>
    </QueryClientProvider>
  )
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')

const panel = (event = 'invoice.paid') => (
  <WebhookSourceConfiguration
    webhook={{ source: 'stripe', event, meta: stripe }}
  />
)

describe('WebhookSourceConfiguration', () => {
  test('shows the route, methods and declared events with the current one marked', () => {
    credentialsMeta = {}
    const out = text(render(panel()))
    assert.match(out, /\/webhooks\/stripe/)
    assert.match(out, /POST, PUT/)
    assert.match(out, /invoice\.paid This trigger/)
    assert.doesNotMatch(out, /invoice\.failed This trigger/)
    assert.match(out, /invoice\.failed/)
  })

  test('lists only the lifecycle steps the source has', () => {
    credentialsMeta = {}
    const out = text(render(panel()))
    assert.match(out, /Reads and checks each message/)
    assert.match(out, /Connects itself to Stripe when you turn it on/)
    assert.doesNotMatch(out, /Checks the connection is still in place/)
    assert.doesNotMatch(out, /Disconnects itself/)
  })

  test('says nothing about a signing secret when none is declared', () => {
    credentialsMeta = {}
    const out = text(render(panel(), false))
    assert.doesNotMatch(out, /Signing secret/)
  })

  test('a saved signing secret reads as saved, with no link', () => {
    credentialsMeta = { stripeWebhookSecret: { type: 'singleton' } }
    const html = render(panel(), true)
    assert.match(text(html), /Signing secret Saved/)
    assert.doesNotMatch(html, /href="\/credentials"/)
  })

  test('registration is hidden until the app reports it', () => {
    assert.doesNotMatch(render(panel()), /webhook-source-registration/)
  })

  test('a source with no stored row waits for the next publish, with no switch', () => {
    const html = render(panel(), undefined, [])
    assert.match(html, /webhook-source-registration-pending/)
    assert.match(text(html), /Not published yet/)
    assert.doesNotMatch(html, /webhook-source-enabled/)
  })

  test('a stored source starts off, with the switch unchecked', () => {
    const row = {
      name: 'stripe',
      declared: true,
      enabled: false,
      status: null,
      detail: null,
    }
    const html = render(panel(), undefined, [row])
    assert.match(html, /webhook-source-registration-off/)
    assert.match(text(html), /Stripe is off/)
    assert.match(html, /data-testid="webhook-source-enabled"/)
    assert.doesNotMatch(html, /checked=""/)
  })

  test('a registered source reads as registered', () => {
    const row = {
      name: 'stripe',
      declared: true,
      enabled: true,
      status: 'registered',
      detail: null,
    }
    const html = render(panel(), undefined, [row])
    assert.match(html, /webhook-source-registration-registered/)
    assert.match(html, /checked=""/)
  })

  test('a failed registration shows the provider detail', () => {
    const row = {
      name: 'stripe',
      declared: true,
      enabled: true,
      status: 'failed',
      detail: 'HTTP 401 from Stripe',
    }
    const html = render(panel(), undefined, [row])
    assert.match(html, /webhook-source-registration-failed/)
    assert.match(text(html), /HTTP 401 from Stripe/)
  })

  test('a missing signing secret says so and links to credentials', () => {
    credentialsMeta = { stripeWebhookSecret: { type: 'singleton' } }
    const html = render(panel(), false)
    assert.match(text(html), /Not saved yet/)
    assert.match(html, /href="\/credentials"/)
    assert.match(text(html), /Open credentials/)
  })
})

describe('TriggersListPanel', () => {
  test('a webhook-fed trigger reads as ready and names its event and route', () => {
    credentialsMeta = {}
    projectMeta = {
      triggerMeta: {
        'stripe:invoice.paid': { pikkuFuncId: 'onInvoicePaid' },
        stripe: { pikkuFuncId: 'onAnyStripe' },
      },
      triggerSourceMeta: {},
      webhookSourceMeta: { stripe },
    }
    const out = text(render(<TriggersListPanel />))
    assert.match(out, /Your app has 2 triggers/)
    assert.doesNotMatch(out, /Nothing to listen to/)
    assert.match(
      out,
      /Listens to “invoice\.paid” from Stripe, received at \/webhooks\/stripe/
    )
    assert.match(out, /Listens to Stripe, received at \/webhooks\/stripe/)
    assert.match(out, /Have something to listen to 2 of 2/)
  })

  test('search filters by the webhook route', () => {
    projectMeta = {
      triggerMeta: {
        'stripe:invoice.paid': { pikkuFuncId: 'onInvoicePaid' },
        'github:push': { pikkuFuncId: 'onPush' },
      },
      triggerSourceMeta: {},
      webhookSourceMeta: { stripe },
    }
    const out = text(render(<TriggersListPanel externalSearch="/webhooks/" />))
    assert.match(out, /1 trigger\b/)
    assert.match(out, /invoice\.paid/)
  })
})

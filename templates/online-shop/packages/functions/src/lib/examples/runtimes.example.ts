import { pikkuSessionlessFunc } from '#pikku/function'
import { wireAddon } from '#pikku/addon'
import { wireTrigger } from '#pikku/trigger'

// @snippet start rt-wire-addon-local
export function wireInvoicing() {
  wireAddon({
    name: 'invoicing',
    package: '@acme/addon-invoicing', // the copied package's name
  })
}
// @snippet end rt-wire-addon-local

// @snippet start rt-wire-addon-postgres
export function wirePostgres() {
  wireAddon({
    name: 'postgres',
    package: '@pikku/addon-postgres',
  })
}
// @snippet end rt-wire-addon-postgres

// @snippet start rt-addon-expose
export function wireExposedAddons() {
  // Exactly these two, whether or not the addon marked them exposed
  wireAddon({
    name: 'shop',
    package: '@acme/addon-shop',
    expose: ['getOrder', 'listOrders'],
  })

  // Nothing from this instance is reachable through rpc.exposed
  wireAddon({ name: 'billing', package: '@acme/addon-billing', expose: false })
}
// @snippet end rt-addon-expose

// @snippet start rt-addon-typed-invoke
export const createStripeCustomer = pikkuSessionlessFunc<void, void>({
  func: async (_services, _data, { rpc }) => {
    // TypeScript knows the exact input and output types
    const result = await rpc.invoke('stripe:customerCreate', {
      name: 'Jane Doe',
      email: 'jane@example.com',
    })
    // result is fully typed based on the addon's function definition
    void result
  },
})
// @snippet end rt-addon-typed-invoke

// @snippet start rt-addon-trigger-handler
export const onChange = pikkuSessionlessFunc<
  { event: string; data: any },
  void
>({
  func: async ({ logger }, data) => {
    logger.info(`Database change: ${data.event}`, data.data)
  },
})

export function wireChangeTrigger() {
  // Declare the trigger and its handler
  wireTrigger({
    name: 'onChange',
    func: onChange,
  })
}
// @snippet end rt-addon-trigger-handler

// @snippet start rt-wire-addon-multiple
export function wireManyAddons() {
  wireAddon({ name: 'postgres', package: '@pikku/addon-postgres' })
  wireAddon({ name: 'redis', package: '@pikku/addon-redis' })
  wireAddon({ name: 'stripe', package: '@pikku/addon-stripe' })
}
// @snippet end rt-wire-addon-multiple

// @snippet start rt-wire-addon-secret-overrides
export function wireEmailAddon() {
  wireAddon({
    name: 'email',
    package: '@pikku/addon-sendgrid',
    secretOverrides: {
      SENDGRID_API_KEY: 'MY_EMAIL_API_KEY',
    },
  })
}
// @snippet end rt-wire-addon-secret-overrides

// @snippet start rt-wire-addon-labels
export function wireLabels() {
  wireAddon({ name: 'labels', package: '@my-org/addon-labels' })
}
// @snippet end rt-wire-addon-labels

// @snippet start rt-wire-addon-global-credentials
export function wireAdminAddon() {
  wireAddon({
    name: 'admin',
    package: '@pikku/addon-admin',
    globalCredentials:
      'administering credentials means setting and clearing any of them, for any user, so it cannot be scoped to a declared set',
  })
}
// @snippet end rt-wire-addon-global-credentials

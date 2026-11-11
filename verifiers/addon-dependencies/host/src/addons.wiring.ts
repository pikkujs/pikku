import { wireAddon } from '#pikku/addon'

wireAddon({ name: 'payments', package: '@pikku/verifiers-addon-deps-stripe' })
wireAddon({
  name: 'billing',
  package: '@pikku/verifiers-addon-deps-billing',
  uses: { stripe: 'payments' },
})

import { wireAddon } from '#pikku/addon'

wireAddon({
  name: 'select',
  package: '@verifier/svc-select',
  providers: ['store', 'queueReal', 'queueNoop'],
})

import { wireAddon } from '#pikku/addon'

wireAddon({
  name: 'select',
  package: '@verifier/svc-select',
  services: ['store', 'queueReal', 'queueNoop'],
})

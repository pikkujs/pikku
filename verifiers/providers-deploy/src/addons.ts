import { wireAddon } from '#pikku/addon'

// Only openai is listed: the anthropic SDK must not reach any bundle.
wireAddon({
  name: 'db',
  package: '@verifier/prov-db',
  providers: ['kysely'],
})
wireAddon({
  name: 'ai',
  package: '@verifier/prov-ai',
  providers: ['openai'],
})

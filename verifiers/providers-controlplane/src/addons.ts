import { wireAddon } from '#pikku/addon'

// The database engine is one generated line: test.sh swaps it between pg and sqlite.
wireAddon({
  name: 'db',
  package: '@verifier/prov-db-pg',
  providers: ['kysely'],
})
wireAddon({
  name: 'ai',
  package: '@verifier/prov-ai',
  providers: ['openai', 'anthropic'],
})
wireAddon({
  name: 'sinks',
  package: '@verifier/prov-sinks',
  providers: ['sinkA', 'sinkB'],
})

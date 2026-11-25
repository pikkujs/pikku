declare function wireRemoteAddon(options: unknown): void

// PKU381: providers run in this process, and a remote addon runs elsewhere.
wireRemoteAddon({
  name: 'remote',
  url: 'https://example.invalid',
  providers: ['pinoLogger'],
} as never)

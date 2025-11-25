import { wireForgeNode } from '@pikku/core'

// Forge node for the hello function - overrides package icon
wireForgeNode({
  name: 'hello',
  displayName: 'Say Hello',
  category: 'Communication',
  type: 'action',
  rpc: 'hello',
  description: 'Sends a friendly greeting message',
  icon: 'hello.svg',
  tags: ['external'],
})

// Forge node for the goodbye function - inherits package icon
wireForgeNode({
  name: 'goodbye',
  displayName: 'Say Goodbye',
  category: 'Communication',
  type: 'end',
  rpc: 'goodbye',
  description: 'Sends a farewell message',
  tags: ['external'],
})

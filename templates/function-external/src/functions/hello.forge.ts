import { wireForgeNode } from '@pikku/core'

// Forge node for the hello function
wireForgeNode({
  name: 'hello',
  displayName: 'Say Hello',
  category: 'Communication',
  type: 'action',
  rpc: 'hello',
  description: 'Sends a friendly greeting message',
  tags: ['external'],
})

// Forge node for the goodbye function
wireForgeNode({
  name: 'goodbye',
  displayName: 'Say Goodbye',
  category: 'Communication',
  type: 'end',
  rpc: 'goodbye',
  description: 'Sends a farewell message',
  tags: ['external'],
})

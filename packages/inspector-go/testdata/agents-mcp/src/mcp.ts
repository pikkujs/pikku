import {
  wireMCPResource,
  wireMCPPrompt,
  pikkuMCPResourceFunc,
  pikkuMCPPromptFunc,
} from './pikku.js'
import { readNote, summarisePrompt } from './functions.js'

wireMCPResource({
  uri: 'notes/{id}',
  title: 'Note',
  description: 'A note',
  tags: ['notes'],
  func: readNote,
})

wireMCPResource({
  uri: 'inline/{id}',
  title: 'Inline',
  description: 'Inline resource',
  streaming: true,
  func: pikkuMCPResourceFunc<{ id: string }, unknown>({
    func: async (_services, { id }) => id,
  }),
})

wireMCPResource({ uri: 'untitled', description: 'no title', func: readNote })
wireMCPResource({ title: 'no uri', description: 'x', func: readNote })
wireMCPResource({ uri: 'nofunc', title: 'x', description: 'x' })

wireMCPPrompt({
  name: 'summarise',
  description: 'Summarise a topic',
  func: summarisePrompt,
})

wireMCPPrompt({
  name: 'inline-prompt',
  description: 'Inline prompt',
  func: pikkuMCPPromptFunc<{ topic: string }, unknown>({
    func: async (_services, { topic }) => topic,
  }),
})

wireMCPPrompt({ name: 'undescribed', func: summarisePrompt })

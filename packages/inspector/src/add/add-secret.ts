import { createAddKeyedWiring } from './add-keyed-wiring.js'

export const addSecret = createAddKeyedWiring({
  functionName: 'wireSecret',
  idField: 'secretId',
  label: 'Secret',
  schemaPrefix: 'SecretSchema',
  getState: (state) => state.secrets,
})

import { createAddKeyedWiring } from './add-keyed-wiring.js'

export const addSecret = createAddKeyedWiring({
  functionName: 'defineSecret',
  idField: 'secretId',
  label: 'Secret',
  schemaPrefix: 'SecretSchema',
  flagField: 'optional',
  getState: (state) => state.secrets,
})

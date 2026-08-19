import { createAddKeyedWiring } from './add-keyed-wiring.js'

export const addVariable = createAddKeyedWiring({
  functionName: 'defineVariable',
  idField: 'variableId',
  label: 'Variable',
  schemaPrefix: 'VariableSchema',
  flagField: 'optional',
  getState: (state) => state.variables,
})

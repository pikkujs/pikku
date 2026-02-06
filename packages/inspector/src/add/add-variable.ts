import { createAddKeyedWiring } from './add-keyed-wiring.js'

export const addVariable = createAddKeyedWiring({
  functionName: 'wireVariable',
  idField: 'variableId',
  label: 'Variable',
  schemaPrefix: 'VariableSchema',
  getState: (state) => state.variables,
})

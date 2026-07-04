export interface PersonaFlowRef {
  name: string
  displayName: string
}

export interface PersonaEntry {
  key: string
  name: string
  email: string
  jobTitle?: string
  personality?: string
  flows: PersonaFlowRef[]
}

export interface PersonaRef {
  key: string
  name?: string
  jobTitle?: string
}

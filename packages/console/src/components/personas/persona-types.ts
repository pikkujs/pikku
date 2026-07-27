export interface PersonaScenarioRef {
  name: string
  displayName: string
}

export interface PersonaEntry {
  key: string
  name: string
  email: string
  jobTitle?: string
  personality?: string
  /** The scenarios that cast this persona. */
  scenarios: PersonaScenarioRef[]
  /** The names of the features those scenarios belong to. */
  features: string[]
}

export interface PersonaRef {
  key: string
  name?: string
  jobTitle?: string
}

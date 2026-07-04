export interface PersonaEntry {
  key: string
  name: string
  email: string
  jobTitle?: string
  personality?: string
  flowCount: number
}

export interface PersonaRef {
  key: string
  name?: string
  jobTitle?: string
}

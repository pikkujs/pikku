export type ComponentVariants = Record<string, string[]>

export type ComponentEntry = {
  name: string
  group?: string
  description?: string
  variants: ComponentVariants
  defaultVariants: Record<string, string>
  npmDeps: string[]
  registryDeps: string[]
  files: Record<string, string>
}

export type Block = {
  name: string
  title: string
  description: string
  tags: string[]
  dependsOn: string[]
  components: string[]
  npmDeps: string[]
  internal: boolean
  i18nKeys: Record<string, string>
  usage?: string
  source: Record<string, string>
}

export type ResolvedBlock = {
  block: Block
  composes: string[]
  components: string[]
  files: Record<string, string>
  i18nKeys: Record<string, string>
  npmDeps: string[]
}

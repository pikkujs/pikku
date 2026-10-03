/** A ready-made Mantine page section: its files, the i18n keys it calls and the blocks it composes. */
export type MantineBlock = {
  name: string
  title: string
  description: string
  tags: string[]
  dependsOn: string[]
  npmDeps: string[]
  internal: boolean
  i18nKeys: Record<string, string>
  usage?: string
  source: Record<string, string>
}

/** A block with every block it composes, ready to copy into one folder. */
export type ResolvedMantineBlock = {
  block: MantineBlock
  composes: string[]
  files: Record<string, string>
  i18nKeys: Record<string, string>
  npmDeps: string[]
}

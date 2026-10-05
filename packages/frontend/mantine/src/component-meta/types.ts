export type MantineTokenScale =
  'spacing' | 'radius' | 'fontSizes' | 'shadows' | 'size'

export type MantinePropKind =
  | 'select'
  | 'boolean'
  | 'number'
  | 'color'
  | 'token'
  | 'text'
  | 'node'
  | 'function'
  | 'object'

export type MantineManifestProp = {
  name: string
  kind: MantinePropKind
  options?: string[]
  freeText?: boolean
  tokenScale?: MantineTokenScale
  default?: string
  description?: string
}

export type MantineComponentManifest = {
  props: MantineManifestProp[]
  variants: string[]
  sizes: string[]
  stylesNames: string[]
  cssVariables: Record<string, string[]>
}

export type MantineMeta = {
  mantineVersion: string
  styleProps: MantineManifestProp[]
  components: Record<string, MantineComponentManifest>
}

/** One component's props, variants, sizes and Styles API parts; `source: 'none'` when no manifest covers it. */
export type ComponentMeta = {
  props: string[]
  variantOptions: string[]
  sizeOptions: string[]
  propMeta?: MantineManifestProp[]
  stylePropMeta?: MantineManifestProp[]
  stylesNames?: string[]
  cssVariables?: Record<string, string[]>
  source: 'manifest' | 'none'
}

import { MANTINE_META } from './meta.gen.js'
import type { ComponentMeta, MantineMeta } from './types.js'

export { MANTINE_META }
export type * from './types.js'

const majorOf = (version: string): number => Number(version.split('.')[0])

/** The bundled manifest for a `@mantine/core` version's major, or the newest when no version is given. */
export function mantineManifest(mantineVersion?: string): MantineMeta | null {
  if (mantineVersion === undefined) return MANTINE_META[0] ?? null
  const major = majorOf(mantineVersion)
  if (!Number.isInteger(major)) return null
  return (
    MANTINE_META.find((meta) => majorOf(meta.mantineVersion) === major) ?? null
  )
}

/** Component names in a manifest, sorted. */
export function mantineComponentNames(mantineVersion?: string): string[] {
  return Object.keys(mantineManifest(mantineVersion)?.components ?? {}).sort()
}

/** A component's metadata for a `@mantine/core` version, with a theme's custom variants merged in. */
export function componentMeta(
  componentName: string,
  mantineVersion?: string,
  customVariants: string[] = []
): ComponentMeta {
  const manifest = mantineManifest(mantineVersion)
  const component = manifest?.components[componentName]
  if (!manifest || !component) {
    return { props: [], variantOptions: [], sizeOptions: [], source: 'none' }
  }
  return {
    props: [
      ...component.props.map((prop) => prop.name),
      ...manifest.styleProps.map((prop) => prop.name),
    ],
    variantOptions: [...new Set([...component.variants, ...customVariants])],
    sizeOptions: component.sizes,
    propMeta: component.props,
    stylePropMeta: manifest.styleProps,
    stylesNames: component.stylesNames,
    cssVariables: component.cssVariables,
    source: 'manifest',
  }
}

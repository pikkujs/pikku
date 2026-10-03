import { PRESETS, STRUCTURES, presetToTheme, type Preset, type Theme } from './presets.js'

export type ThemeInput = {
  preset?: string
  structure?: string
  colors?: { primary?: string; secondary?: string; accent?: string }
  fonts?: { heading?: string; body?: string }
  page?: string
  ink?: string
}

/** A preset (or the first one) with any structure, colours, fonts, page and ink layered over it. */
export function composeTheme(input: ThemeInput): { id: string; theme: Theme } {
  const preset = input.preset ? PRESETS.find((p) => p.id === input.preset) : undefined
  if (input.preset && !preset) {
    throw new Error(`No preset "${input.preset}". Available: ${PRESETS.map((p) => p.id).join(', ')}`)
  }
  if (input.structure && !STRUCTURES[input.structure]) {
    throw new Error(`No structure "${input.structure}". Available: ${Object.keys(STRUCTURES).join(', ')}`)
  }
  const first = PRESETS[0]!
  const base = presetToTheme(preset ?? first)
  const structure = input.structure
    ? presetToTheme(
        PRESETS.find((p) => p.structureId === input.structure) ??
          ({ ...first, structureId: input.structure, brandId: preset?.brandId ?? first.brandId } as Preset)
      ).structure
    : base.structure
  const secondary = input.colors?.secondary ?? base.brand.colors.secondary
  const accent = input.colors?.accent ?? base.brand.colors.accent
  return {
    id: preset?.id ?? 'custom',
    theme: {
      name: base.name,
      ...(base.description ? { description: base.description } : {}),
      brand: {
        colors: {
          primary: input.colors?.primary ?? base.brand.colors.primary,
          ...(secondary ? { secondary } : {}),
          ...(accent ? { accent } : {}),
        },
        fonts: {
          heading: input.fonts?.heading ?? base.brand.fonts?.heading,
          body: input.fonts?.body ?? base.brand.fonts?.body,
        },
      },
      structure: {
        ...structure,
        ...(input.page ? { page: input.page } : {}),
        ...(input.ink ? { ink: input.ink } : {}),
      },
    },
  }
}

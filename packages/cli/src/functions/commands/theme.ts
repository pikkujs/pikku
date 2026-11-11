import { pikkuSessionlessFunc } from '#pikku/function'
import {
  LISTED_PRESETS,
  STRUCTURES,
  ThemeWorkspace,
} from '@pikku/code-edit/theme'
import { findWorkspaceRoot } from '@pikku/code-edit/workspace'

export const pikkuThemeList = pikkuSessionlessFunc<null, void>({
  func: async ({ config }) => {
    const workspace = new ThemeWorkspace(findWorkspaceRoot(config.rootDir))
    const { themes, activeId } = await workspace.list()
    const structureIds = new Set(LISTED_PRESETS.map((p) => p.structureId))
    process.stdout.write(
      `${JSON.stringify(
        {
          activeId,
          themes,
          presets: LISTED_PRESETS.map((p) => ({
            preset: p.id,
            name: p.name,
            description: p.description,
            suits: p.tags,
          })),
          structures: Object.entries(STRUCTURES)
            .filter(([id]) => structureIds.has(id))
            .map(([id, s]) => ({
              id,
              name: s.name,
              description: s.description,
            })),
        },
        null,
        2
      )}\n`
    )
  },
})

export const pikkuThemeApply = pikkuSessionlessFunc<
  {
    preset?: string
    structure?: string
    primary?: string
    secondary?: string
    accent?: string
    fontHeading?: string
    fontBody?: string
    page?: string
    ink?: string
    mode?: 'light' | 'dark'
  },
  void
>({
  func: async ({ config }, input) => {
    const workspace = new ThemeWorkspace(findWorkspaceRoot(config.rootDir))
    const { id, theme, emails, contrast } = await workspace.apply({
      preset: input.preset,
      structure: input.structure,
      colors: {
        primary: input.primary,
        secondary: input.secondary,
        accent: input.accent,
      },
      fonts: { heading: input.fontHeading, body: input.fontBody },
      page: input.page,
      ink: input.ink,
      mode: input.mode,
    })
    process.stdout.write(
      `${JSON.stringify(
        {
          applied: id,
          colors: theme.brand.colors,
          mode: theme.structure.mode ?? 'light',
          fonts: theme.brand.fonts,
          contrast,
          emails: emails
            ? 'emails/theme.json re-branded; set its appName to the app name.'
            : 'no emails/ to re-brand',
        },
        null,
        2
      )}\n`
    )
    const lines = contrast.map(
      (c) =>
        `  ${c.ok ? 'ok  ' : 'WARN'} ${c.pair} ${c.ratio.toFixed(2)}:1 (target ${c.target}:1)`
    )
    process.stderr.write(`Contrast report\n${lines.join('\n')}\n`)
    for (const c of contrast.filter((c) => !c.ok)) {
      process.stderr.write(
        `warning: ${c.pair} is ${c.ratio.toFixed(2)}:1, under ${c.target}:1. Adjust --page, --ink or the brand colours.\n`
      )
    }
  },
})

declare module '@project/mantine-themes' {
  import type { MantineThemeOverride } from '@mantine/core'
  export const activeTheme: MantineThemeOverride
  export const buildTheme: (spec: unknown) => MantineThemeOverride
}

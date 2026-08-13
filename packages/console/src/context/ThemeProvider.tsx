import {
  Anchor,
  Container,
  InputWrapper,
  List,
  MantineProvider,
  Tabs,
  createTheme,
  mergeThemeOverrides,
  rem,
} from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { generateColors } from '@mantine/colors-generator'
import { cssVariablesResolver, theme as baseTheme } from '@pikku/mantine/theme'

import 'dayjs/locale/en'
import 'dayjs/locale/de'
import 'dayjs/locale/uk'

const DAYJS_LOCALE_MAP: Record<string, string> = {
  en: 'en',
  de: 'de',
}

/**
 * The console's own additions to the shared palette.
 *
 * The surfaces, text ramp, borders, accent and status colours all come from
 * `@pikku/mantine/theme` — the contract every Pikku console shares, enforced by
 * its own test. Only what is genuinely specific to this app lives here: the
 * per-transport hues a wiring is drawn in, and the handful of components the
 * hosted consoles do not render.
 */
const consoleTheme = mergeThemeOverrides(
  baseTheme,
  createTheme({
    breakpoints: {
      xs: '36em',
      sm: '48em',
      md: '62em',
      lg: '75em',
      xl: '88em',
    },
    // One hue per transport, so a wiring reads the same in the tree, the badge
    // and the graph. Not part of the shared contract: nothing outside this app
    // draws a wiring.
    colors: {
      success: generateColors('#10B981'),
      error: generateColors('#EF4444'),
      function: [
        '#f5f5f5',
        '#e5e5e5',
        '#d4d4d4',
        '#a3a3a3',
        '#737373',
        '#525252',
        '#171717',
        '#0a0a0a',
        '#000000',
        '#000000',
      ],
      workflow: generateColors('#8B5CF6'),
      http: generateColors('#16a34a'),
      channel: generateColors('#9333ea'),
      websocket: generateColors('#9333ea'),
      sse: generateColors('#ea580c'),
      queue: generateColors('#dc2626'),
      scheduler: generateColors('#ca8a04'),
      mcp: generateColors('#ec4899'),
      cli: generateColors('#0891b2'),
      focusedNode: generateColors('#A83CE0'),
      referencedNode: generateColors('#f59e0b'),
    },
    components: {
      Container: Container.extend({
        defaultProps: {
          px: 'xl',
        },
        vars: (_theme, props) => {
          if (props.size === 'xl') {
            return {
              root: {
                '--container-size': '80rem',
              },
            }
          }
          return { root: {} }
        },
      }),
      // Mantine renders Drawer content/header through Paper, so the shared Paper
      // styles bleed into every drawer. Reset them to a solid panel.
      Drawer: {
        styles: {
          content: {
            background: 'var(--mantine-color-body)',
            backdropFilter: 'none',
          },
          header: {
            background: 'var(--mantine-color-body)',
            backdropFilter: 'none',
          },
        },
      },
      InputWrapper: InputWrapper.extend({
        styles: {
          label: {
            color: 'var(--mantine-color-dimmed)',
            fontSize: rem(12),
            fontWeight: 600,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.5px',
            marginBottom: rem(6),
          },
        },
      }),
      Badge: {
        styles: {
          root: {
            fontFamily: 'var(--mantine-font-family-monospace)',
            fontWeight: 500,
            borderWidth: 0,
            borderRadius: rem(4),
          },
        },
      },
      // The shared theme sets the tab's type; the list band and the hover/active
      // treatment in code-highlight.css are this app's tabbed surfaces.
      Tabs: Tabs.extend({
        classNames: () => ({
          tab: 'pikku-tab',
        }),
        styles: {
          list: {
            borderBottom: '1px solid var(--app-border)',
            background: 'var(--app-surface)',
            paddingLeft: 14,
            paddingRight: 14,
            flexShrink: 0,
            minHeight: 40,
          },
        },
      }),
      Anchor: Anchor.extend({
        styles: {
          root: {
            textDecoration: 'none',
            color: 'var(--mantine-color-text)',
          },
        },
      }),
      List: List.extend({
        styles: () => {
          return {
            root: {
              paddingLeft: rem(10),
            },
          }
        },
      }),
    },
  })
)

export const ThemeProvider: React.FC<{
  children: React.ReactNode
  locale?: string
}> = ({ children, locale = 'en' }) => {
  const dateLocale = DAYJS_LOCALE_MAP[locale] || 'en'

  return (
    <MantineProvider
      theme={consoleTheme}
      defaultColorScheme="dark"
      cssVariablesResolver={cssVariablesResolver}
    >
      <DatesProvider settings={{ locale: dateLocale }}>
        {children}
      </DatesProvider>
    </MantineProvider>
  )
}

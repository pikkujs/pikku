import {
  InputWrapper,
  List,
  MantineProvider,
  Stepper,
  Container,
  localStorageColorSchemeManager,
} from '@mantine/core'
import { DatesProvider } from '@mantine/dates'

const manager = localStorageColorSchemeManager({ key: 'mantine-color-scheme' })

import { Button, Anchor, createTheme, rem } from '@mantine/core'
import { generateColors } from '@mantine/colors-generator'

import 'dayjs/locale/en'
import 'dayjs/locale/de'
import 'dayjs/locale/uk'

const DAYJS_LOCALE_MAP: Record<string, string> = {
  en: 'en',
  de: 'de',
}

const theme = createTheme({
  primaryColor: 'primary',
  breakpoints: {
    xs: '36em',
    sm: '48em',
    md: '62em',
    lg: '75em',
    xl: '88em',
  },
  colors: {
    primary: generateColors('#A83CE0'), // Magenta-ish Violet - creative, energetic
    secondary: generateColors('#F5A623'), // Warm Amber-Gold
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
    workflow: generateColors('#8B5CF6'), // Workflow purple/violet
    http: generateColors('#16a34a'), // HTTP green
    channel: generateColors('#9333ea'), // Channel purple
    websocket: generateColors('#9333ea'), // WebSocket purple (deprecated, use channel)
    sse: generateColors('#ea580c'), // SSE orange
    queue: generateColors('#dc2626'), // Queue red
    scheduler: generateColors('#ca8a04'), // Cron yellow
    mcp: generateColors('#ec4899'), // MCP pink
    cli: generateColors('#0891b2'), // CLI cyan
    focusedNode: generateColors('#A83CE0'), // Primary purple - panel is open for this node
    referencedNode: generateColors('#f59e0b'), // Amber - $ref pointing to this node
    dark: [
      '#d5d7da',
      '#C1C2C5',
      '#A6A7AB',
      '#909296',
      '#5C5F66',
      '#373A40',
      '#2C2E33',
      '#1A1B1E',
      '#141517',
      '#101113',
    ],
  },
  fontFamily:
    'ui-sans-serif,system-ui,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"',
  fontFamilyMonospace:
    'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
  fontSizes: {
    xs: rem(10),
    sm: rem(12),
    md: rem(14),
    lg: rem(16),
    lgxl: rem(18),
    xl: rem(20),
    xxl: rem(32),
    xxll: rem(38),
    xxxl: rem(48),
    xxxxl: rem(56),
    hero: rem(64),
  },
  headings: {
    fontFamily:
      'ui-sans-serif,system-ui,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"',
    sizes: {
      h1: {
        fontSize: rem(40),
        lineHeight: '1.2',
        fontWeight: '400',
      },
      h2: {
        fontSize: rem(20),
        lineHeight: '1.2',
        fontWeight: '600',
      },
      h3: {
        fontSize: rem(18),
        lineHeight: '1.2',
        fontWeight: '600',
      },
      h4: {
        fontSize: rem(16),
        lineHeight: '1.2',
        fontWeight: '600',
      },
      h5: {
        fontSize: rem(14),
        lineHeight: '1.2',
        fontWeight: '600',
      },
      h6: {
        fontSize: rem(12),
        lineHeight: '1.2',
        fontWeight: '600',
      },
    },
  },
  components: {
    Container: Container.extend({
      defaultProps: {
        px: 'xl',
      },
      vars: (theme, props) => {
        if (props.size === 'xl') {
          return {
            root: {
              '--container-size': '80rem', // 1280px
            },
          }
        }
        return { root: {} }
      },
    }),
    Button: Button.extend({
      defaultProps: {
        size: 'md',
        radius: 'lg',
      },
      styles: (theme, props) => ({
        root: {
          color:
            props.variant === 'filled' || !props.variant
              ? 'var(--mantine-color-white)'
              : undefined,
        },
      }),
    }),
    InputWrapper: InputWrapper.extend({
      styles: {
        label: {
          fontSize: rem(14),
          fontWeight: 500,
          marginBottom: rem(10),
        },
      },
    }),
    Stepper: Stepper.extend({
      styles: {
        stepIcon: {
          backgroundColor: 'initial',
          color: 'var(--mantine-color-dimmed)',
          width: rem(30),
          height: rem(30),
          minWidth: rem(30),
          minHeight: rem(30),
        },
        stepLabel: {
          fontSize: rem(14),
          color: 'var(--mantine-color-dimmed)',
        },
      },
    }),
    Anchor: Anchor.extend({
      styles: (theme) => ({
        root: {
          textDecoration: 'none',
          color: theme.colors.gray[9],
          '&:hover, &:focusVisible': {
            color: `${theme.colors.blue[1]} !important`,
          },
        },
      }),
    }),
    List: List.extend({
      styles: (theme) => {
        return {
          root: {
            paddingLeft: rem(10),
          },
          item: {
            color: theme.colors.gray[8],
          },
        }
      },
    }),
  },
})

export const ThemeProvider: React.FunctionComponent<{
  children: React.ReactNode
  initial: 'light' | 'dark' | 'auto'
  locale?: string
}> = ({ children, initial, locale = 'en' }) => {
  const dateLocale = DAYJS_LOCALE_MAP[locale] || 'en'

  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme={initial}
      colorSchemeManager={manager}
      cssVariablesResolver={() => ({
        variables: {},
        light: {},
        dark: {
          '--mantine-color-body': '#0a0a0f',
          '--mantine-color-gray-light': 'rgba(255,255,255,0.11)',
          '--mantine-color-gray-light-color': 'rgba(255,255,255,0.72)',
          '--mantine-color-gray-light-hover': 'rgba(255,255,255,0.16)',
        },
      })}
    >
      <DatesProvider settings={{ locale: dateLocale }}>
        {children}
      </DatesProvider>
    </MantineProvider>
  )
}

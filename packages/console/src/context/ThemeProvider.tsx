import {
  InputWrapper,
  List,
  MantineProvider,
  Stepper,
  Container,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from '@mantine/core'
import { DatesProvider } from '@mantine/dates'

import { Button, Anchor, createTheme, rem } from '@mantine/core'
import { generateColors } from '@mantine/colors-generator'

import 'dayjs/locale/en'
import 'dayjs/locale/de'
import 'dayjs/locale/uk'

const DAYJS_LOCALE_MAP: Record<string, string> = {
  en: 'en',
  de: 'de',
}

const emerald: MantineColorsTuple = [
  '#e6fff5',
  '#b3ffe0',
  '#80ffcc',
  '#4dffb8',
  '#1affa3',
  '#00e68a',
  '#00cc7a',
  '#00b36b',
  '#00995c',
  '#00804d',
]

const dark: MantineColorsTuple = [
  '#C1C2C5',
  '#A6A7AB',
  '#909296',
  '#5c5f66',
  '#373A40',
  '#2C2E33',
  '#1a1c24',
  '#13151c',
  '#0e1016',
  '#0b0d12',
]

const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    '--app-glass-bg': 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
    '--app-glass-border': 'rgba(255,255,255,0.06)',
    '--app-glass-backdrop': 'blur(8px)',
    '--app-input-bg': 'rgba(255,255,255,0.02)',
    '--app-surface': dark[8],
    '--app-code-bg': dark[8],
  },
  dark: {
    '--mantine-color-body': dark[9],
    '--mantine-color-default-border': 'rgba(255,255,255,0.06)',
    '--mantine-color-default-hover': 'rgba(255,255,255,0.04)',
    '--mantine-color-gray-light': 'rgba(255,255,255,0.06)',
    '--mantine-color-gray-light-color': 'rgba(255,255,255,0.72)',
    '--mantine-color-gray-light-hover': 'rgba(255,255,255,0.09)',
    '--mantine-color-gray-1': 'rgba(255,255,255,0.04)',
    '--mantine-color-blue-6': 'rgba(255,255,255,0.5)',
    '--mantine-color-blue-light': 'rgba(255,255,255,0.04)',
    '--mantine-color-blue-3': 'rgba(255,255,255,0.15)',
  },
  light: {},
})

const theme = createTheme({
  primaryColor: 'gray',
  breakpoints: {
    xs: '36em',
    sm: '48em',
    md: '62em',
    lg: '75em',
    xl: '88em',
  },
  colors: {
    emerald,
    dark,
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
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  fontFamilyMonospace: 'JetBrains Mono, monospace',
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
    fontFamily: 'JetBrains Mono, monospace',
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
  defaultRadius: 'md',
  components: {
    Container: Container.extend({
      defaultProps: {
        px: 'xl',
      },
      vars: (theme, props) => {
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
    Paper: {
      defaultProps: {
        radius: 'lg',
      },
      styles: {
        root: {
          background: 'var(--app-glass-bg)',
          borderColor: 'var(--app-glass-border)',
          backdropFilter: 'var(--app-glass-backdrop)',
        },
      },
    },
    Button: Button.extend({
      styles: {
        root: {
          fontWeight: 600,
        },
      },
    }),
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
    TextInput: {
      styles: {
        input: {
          backgroundColor: 'var(--app-input-bg)',
          borderColor: 'var(--app-glass-border)',
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 13,
        },
      },
    },
    Select: {
      styles: {
        input: {
          backgroundColor: 'var(--app-input-bg)',
          borderColor: 'var(--app-glass-border)',
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 13,
        },
        dropdown: {
          backgroundColor: dark[7],
          borderColor: 'var(--app-glass-border)',
        },
        option: {
          fontSize: 13,
        },
      },
    },
    Textarea: {
      styles: {
        input: {
          backgroundColor: 'var(--app-input-bg)',
          borderColor: 'var(--app-glass-border)',
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 12,
        },
      },
    },
    SegmentedControl: {
      styles: {
        root: {
          backgroundColor: 'var(--app-input-bg)',
          border: '1px solid var(--app-glass-border)',
        },
        label: {
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 12,
          fontWeight: 500,
        },
      },
    },
    Accordion: {
      styles: {
        item: {
          background: 'var(--app-glass-bg)',
          borderColor: 'var(--app-glass-border)',
          backdropFilter: 'var(--app-glass-backdrop)',
          borderRadius: 'var(--mantine-radius-lg)',
        },
        control: {
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.8px',
          color: 'var(--mantine-color-dimmed)',
        },
        content: {
          padding: 0,
        },
      },
    },
    Tabs: {
      styles: {
        tab: {
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 12,
          fontWeight: 600,
        },
      },
    },
    Stepper: Stepper.extend({
      styles: {
        stepIcon: {
          backgroundColor: 'var(--app-input-bg)',
          borderColor: 'var(--app-glass-border)',
          width: rem(30),
          height: rem(30),
          minWidth: rem(30),
          minHeight: rem(30),
        },
        stepLabel: {
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: rem(11),
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.5px',
          color: 'var(--mantine-color-dimmed)',
        },
        separator: {
          backgroundColor: 'var(--app-glass-border)',
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

export const ThemeProvider: React.FunctionComponent<{
  children: React.ReactNode
  locale?: string
}> = ({ children, locale = 'en' }) => {
  const dateLocale = DAYJS_LOCALE_MAP[locale] || 'en'

  return (
    <MantineProvider
      theme={theme}
      forceColorScheme="dark"
      cssVariablesResolver={cssVariablesResolver}
    >
      <DatesProvider settings={{ locale: dateLocale }}>
        {children}
      </DatesProvider>
    </MantineProvider>
  )
}

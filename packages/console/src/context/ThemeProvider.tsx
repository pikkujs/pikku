import {
  InputWrapper,
  List,
  MantineProvider,
  Stepper,
  Container,
  Tabs,
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
    // No glass in the console: surfaces are solid, no backdrop blur. (Kept as a
    // var so every Paper/Accordion/Spotlight consumer stays a single source.)
    '--app-glass-backdrop': 'none',
  },
  dark: {
    '--mantine-color-body': dark[9],
    // Shell surfaces: the rail sits half a step above the content canvas so it
    // reads as its own plane (not a border-only separation).
    '--app-rail-bg': dark[7],
    '--app-rail-border': 'rgba(255,255,255,0.06)',
    // One selection accent for the whole console (cyan). Bar = the 2px active
    // marker, soft = the active row tint, accent = active icon/label color.
    '--app-accent': '#22d3ee',
    '--app-accent-bar': '#06b6d4',
    '--app-accent-soft': 'rgba(6,182,212,0.13)',
    '--mantine-color-default-border': 'transparent',
    '--mantine-color-default-hover': 'rgba(255,255,255,0.05)',
    '--mantine-color-gray-light': 'rgba(255,255,255,0.08)',
    '--mantine-color-gray-light-color': 'rgba(255,255,255,0.78)',
    '--mantine-color-gray-light-hover': 'rgba(255,255,255,0.11)',
    '--mantine-color-gray-1': 'rgba(255,255,255,0.05)',
    '--mantine-color-blue-6': 'rgba(255,255,255,0.55)',
    '--mantine-color-blue-light': 'rgba(255,255,255,0.05)',
    '--mantine-color-blue-3': 'rgba(255,255,255,0.18)',
    // Solid raised surface — no translucent glass gradient.
    '--app-glass-bg': dark[7],
    '--app-glass-border': 'transparent',
    '--app-input-bg': 'rgba(255,255,255,0.04)',
    '--app-surface': dark[7],
    '--app-code-bg': dark[8],
    '--app-panel-bg': dark[8],
    '--app-panel-bg-soft': dark[7],
    '--app-panel-bg-strong': dark[6],
    '--app-panel-bg-raised': dark[6],
    '--app-shadow-panel': '0 4px 24px rgba(0,0,0,0.4)',
    '--app-border': 'transparent',
    '--app-row-border': 'transparent',
    '--app-meta-label': '#748398',
    '--app-meta-value': '#e2e8f0',
    '--app-text': '#a8b8cc',
    '--app-text-muted': '#8496ad',
    '--app-text-dim': '#7a8ba3',
    '--app-text-faint': '#6b7a90',
    '--app-section-label': '#8496ad',
    '--app-tag-bg': 'rgba(6,182,212,0.12)',
    '--app-tag-border': 'transparent',
    '--app-tag-color': '#22d3ee',
    '--app-service-bg': 'rgba(124,58,237,0.14)',
    '--app-service-border': 'transparent',
    '--app-service-color': '#a78bfa',
    '--app-blue': '#60a5fa',
    '--app-blue-border': 'transparent',
    '--app-blue-hover': 'rgba(96,165,250,0.10)',
    '--app-green': '#4ade80',
    '--app-green-border': 'transparent',
    '--app-red': '#f87171',
    '--app-red-border': 'transparent',
    '--app-amber': '#fbbf24',
    '--app-amber-border': 'transparent',
    '--app-surface-info': 'rgba(96,165,250,0.08)',
    '--app-surface-success': 'rgba(74,222,128,0.08)',
    '--app-surface-warning': 'rgba(251,191,36,0.08)',
    '--app-surface-danger-soft': 'rgba(248,113,113,0.08)',
  },
  light: {
    '--mantine-color-body': '#f4f5f7',
    // Rail sits above the (slightly greyer) content canvas as a white plane.
    '--app-rail-bg': '#ffffff',
    '--app-rail-border': 'rgba(0,0,0,0.07)',
    '--app-accent': '#0891b2',
    '--app-accent-bar': '#0891b2',
    '--app-accent-soft': 'rgba(6,182,212,0.10)',
    '--mantine-color-default-border': 'transparent',
    '--mantine-color-default-hover': 'rgba(0,0,0,0.04)',
    '--mantine-color-gray-light': 'rgba(0,0,0,0.06)',
    '--mantine-color-gray-light-color': 'rgba(0,0,0,0.78)',
    '--mantine-color-gray-light-hover': 'rgba(0,0,0,0.09)',
    '--mantine-color-gray-1': 'rgba(0,0,0,0.05)',
    '--mantine-color-blue-6': '#4b5563',
    '--mantine-color-blue-light': 'rgba(0,0,0,0.04)',
    '--mantine-color-blue-3': 'rgba(0,0,0,0.12)',
    // Solid raised surface — no translucent glass gradient.
    '--app-glass-bg': '#ffffff',
    '--app-glass-border': 'transparent',
    '--app-input-bg': 'rgba(0,0,0,0.03)',
    '--app-surface': '#ffffff',
    '--app-code-bg': '#f1f3f5',
    '--app-panel-bg': '#f1f3f5',
    '--app-panel-bg-soft': '#f8f9fa',
    '--app-panel-bg-strong': '#e9ecef',
    '--app-panel-bg-raised': '#ffffff',
    '--app-shadow-panel': '0 4px 24px rgba(0,0,0,0.08)',
    '--app-border': 'transparent',
    '--app-row-border': 'transparent',
    '--app-meta-label': '#64748b',
    '--app-meta-value': '#1e293b',
    '--app-text': '#374151',
    '--app-text-muted': '#5b6472',
    '--app-text-dim': '#64748b',
    '--app-text-faint': '#6b7280',
    '--app-section-label': '#5b6472',
    '--app-tag-bg': 'rgba(6,182,212,0.08)',
    '--app-tag-border': 'transparent',
    '--app-tag-color': '#0891b2',
    '--app-service-bg': 'rgba(124,58,237,0.08)',
    '--app-service-border': 'transparent',
    '--app-service-color': '#7c3aed',
    '--app-blue': '#2563eb',
    '--app-blue-border': 'transparent',
    '--app-blue-hover': 'rgba(37,99,235,0.08)',
    '--app-green': '#16a34a',
    '--app-green-border': 'transparent',
    '--app-red': '#dc2626',
    '--app-red-border': 'transparent',
    '--app-amber': '#d97706',
    '--app-amber-border': 'transparent',
    '--app-surface-info': 'rgba(37,99,235,0.06)',
    '--app-surface-success': 'rgba(22,163,74,0.06)',
    '--app-surface-warning': 'rgba(217,119,6,0.06)',
    '--app-surface-danger-soft': 'rgba(220,38,38,0.06)',
  },
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
    // Mantine renders Drawer content/header through Paper, so the glass Paper
    // styles above bleed into every drawer as a translucent blur. Reset them to
    // a solid panel — drawers are the console's primary surface, not chrome.
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
          backgroundColor: 'var(--app-surface)',
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
    Tabs: Tabs.extend({
      defaultProps: {
        // One selection accent across the console (cyan), matching the nav +
        // channel-tree active markers.
        color: 'cyan',
      },
      classNames: (_theme, props) => ({
        tab: 'pikku-tab',
      }),
      styles: {
        tab: {
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 13,
          fontWeight: 500,
          backgroundColor: 'transparent',
          borderRadius: 0,
          padding: '10px 14px',
          transition: 'all 0.15s',
          color: '#8fa0b4',
        },
        list: {
          borderBottom: '1px solid var(--app-row-border)',
          background: 'var(--app-surface)',
          paddingLeft: 14,
          paddingRight: 14,
          flexShrink: 0,
          minHeight: 40,
        },
      },
    }),
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

export const ThemeProvider: React.FC<{
  children: React.ReactNode
  locale?: string
}> = ({ children, locale = 'en' }) => {
  const dateLocale = DAYJS_LOCALE_MAP[locale] || 'en'

  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme="dark"
      cssVariablesResolver={cssVariablesResolver}
    >
      <DatesProvider settings={{ locale: dateLocale }}>
        {children}
      </DatesProvider>
    </MantineProvider>
  )
}

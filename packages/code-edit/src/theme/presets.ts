export const THEME_ID_RE = /^[a-z][a-z0-9-]{0,38}$/

export type Brand = {
  colors: { primary: string; secondary?: string; accent?: string }
  fonts?: { heading?: string; body?: string; mono?: string }
}

export type Structure = {
  defaultRadius?: string
  autoContrast?: boolean
  primaryShade?: number | { light?: number; dark?: number }
  shadows?: Record<string, string>
  radius?: Record<string, string>
  spacing?: Record<string, string>
  defaultGradient?: { from: string; to: string; deg?: number }
  components?: Record<string, unknown>
  defaultColorScheme?: 'light' | 'dark' | 'auto'
  white?: string
  black?: string
  darkColors?: string[]
}

export type Theme = {
  name: string
  description?: string
  brand: Brand
  structure: Structure
}

type NamedBrand = Brand & { name: string }
type NamedStructure = Structure & { name: string; description?: string }

export type Preset = {
  id: string
  name: string
  description: string
  tags: string[]
  brandId: string
  structureId: string
}

const SHADE = { light: 6, dark: 5 }

export const STRUCTURES: Record<string, NamedStructure> = {
  aurora: {
    name: 'Aurora',
    description: 'Soft gradient surfaces, large radius, big diffuse shadows. Modern SaaS.',
    defaultRadius: 'lg',
    autoContrast: true,
    primaryShade: SHADE,
    defaultColorScheme: 'light',
    darkColors: [
      '#ece9ff',
      '#cdc7e8',
      '#a79fc4',
      '#7d76a0',
      '#565073',
      '#3e3958',
      '#2a2640',
      '#1e1b30',
      '#161327',
      '#0d0b1a',
    ],
    shadows: {
      xs: '0 1px 3px rgba(0,0,0,0.10)',
      sm: '0 6px 18px -6px rgba(80,60,200,0.30)',
      md: '0 14px 40px -10px rgba(80,60,200,0.38)',
      lg: '0 28px 64px -14px rgba(80,60,200,0.45)',
      xl: '0 40px 90px -18px rgba(80,60,200,0.5)',
    },
    components: {
      Card: { defaultProps: { shadow: 'md', radius: 'lg' } },
      Paper: { defaultProps: { shadow: 'sm', radius: 'lg' } },
      Button: { defaultProps: { radius: 'xl', variant: 'gradient' } },
    },
  },
  linear: {
    name: 'Linear',
    description: 'Ultra-minimal: hairline borders, near-flat, tiny radius. Vercel/Linear feel.',
    defaultRadius: 'sm',
    autoContrast: true,
    primaryShade: SHADE,
    defaultColorScheme: 'light',
    darkColors: [
      '#e6e6e9',
      '#c8c8cd',
      '#9a9aa2',
      '#6f6f78',
      '#4a4a52',
      '#35353c',
      '#26262b',
      '#1b1b1f',
      '#141417',
      '#0d0d0f',
    ],
    shadows: {
      xs: '0 1px 0 rgba(0,0,0,0.04)',
      sm: '0 1px 2px rgba(0,0,0,0.06)',
      md: '0 2px 4px rgba(0,0,0,0.08)',
      lg: '0 4px 8px rgba(0,0,0,0.10)',
      xl: '0 8px 16px rgba(0,0,0,0.12)',
    },
    components: {
      Card: { defaultProps: { shadow: 'xs', radius: 'sm', withBorder: true } },
      Paper: { defaultProps: { shadow: 'xs', radius: 'sm', withBorder: true } },
      Button: { defaultProps: { radius: 'sm', variant: 'default' } },
    },
  },
  glass: {
    name: 'Glass',
    description: 'Translucent blurred panels (backdrop-blur) with soft glow. Glassmorphism.',
    defaultRadius: 'lg',
    autoContrast: true,
    primaryShade: SHADE,
    defaultColorScheme: 'light',
    darkColors: [
      '#e8f0fb',
      '#c8dcf0',
      '#9fbfe0',
      '#6f96c0',
      '#4a6b94',
      '#34506f',
      '#243a52',
      '#1a2b3d',
      '#13202e',
      '#0c1620',
    ],
    shadows: {
      xs: '0 2px 8px rgba(0,0,0,0.18)',
      sm: '0 8px 24px -6px rgba(0,0,0,0.30)',
      md: '0 16px 48px -10px rgba(0,0,0,0.40)',
      lg: '0 28px 70px -14px rgba(0,0,0,0.48)',
      xl: '0 40px 100px -18px rgba(0,0,0,0.55)',
    },
    components: {
      Card: {
        defaultProps: { radius: 'lg' },
        styles: {
          root: {
            backgroundColor: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(255,255,255,0.14)',
          },
        },
      },
      Paper: {
        defaultProps: { radius: 'lg' },
        styles: {
          root: {
            backgroundColor: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.10)',
          },
        },
      },
      Button: { defaultProps: { radius: 'xl', variant: 'light' } },
    },
  },
  breeze: {
    name: 'Breeze',
    description: 'Airy pastel, big radius, light soft shadows, NO hard borders. Wellness/booking.',
    defaultRadius: 'xl',
    autoContrast: true,
    primaryShade: SHADE,
    defaultColorScheme: 'light',
    shadows: {
      xs: '0 1px 3px rgba(20,120,110,0.06)',
      sm: '0 4px 14px -4px rgba(20,120,110,0.12)',
      md: '0 10px 30px -8px rgba(20,120,110,0.16)',
      lg: '0 20px 48px -12px rgba(20,120,110,0.20)',
      xl: '0 30px 70px -16px rgba(20,120,110,0.24)',
    },
    components: {
      Card: { defaultProps: { shadow: 'sm', radius: 'xl', withBorder: false } },
      Paper: {
        defaultProps: { shadow: 'xs', radius: 'xl', withBorder: false },
      },
      Button: { defaultProps: { radius: 'xl', variant: 'light' } },
    },
  },
  brutalist: {
    name: 'Brutalist',
    description: 'Square corners, hard black offset shadows, thick borders, heavy type.',
    defaultRadius: '0',
    autoContrast: true,
    primaryShade: SHADE,
    defaultColorScheme: 'light',
    shadows: {
      xs: '2px 2px 0 #000',
      sm: '4px 4px 0 #000',
      md: '6px 6px 0 #000',
      lg: '9px 9px 0 #000',
      xl: '14px 14px 0 #000',
    },
    components: {
      Card: {
        defaultProps: { shadow: 'md', radius: 0, withBorder: true },
        styles: { root: { borderWidth: 3, borderColor: '#000' } },
      },
      Paper: {
        defaultProps: { shadow: 'sm', radius: 0, withBorder: true },
        styles: { root: { borderWidth: 3, borderColor: '#000' } },
      },
      Button: {
        defaultProps: { radius: 0 },
        styles: {
          root: {
            fontWeight: 800,
            borderWidth: 3,
            borderColor: '#000',
            boxShadow: '4px 4px 0 #000',
          },
        },
      },
    },
  },
  neon: {
    name: 'Neon',
    description: 'Dark, glowing colored shadows on near-black, vibrant accents. Gaming/nightlife.',
    defaultRadius: 'md',
    autoContrast: true,
    primaryShade: SHADE,
    defaultColorScheme: 'dark',
    darkColors: [
      '#f3e9ff',
      '#dcc4ff',
      '#bd93f7',
      '#9a63ee',
      '#7b3ff0',
      '#5a2bb0',
      '#3a1c70',
      '#241048',
      '#160a2e',
      '#0a0418',
    ],
    shadows: {
      xs: '0 0 6px rgba(155,99,238,0.35)',
      sm: '0 0 14px rgba(155,99,238,0.45)',
      md: '0 0 24px rgba(155,99,238,0.55)',
      lg: '0 0 40px rgba(155,99,238,0.6)',
      xl: '0 0 64px rgba(155,99,238,0.7)',
    },
    components: {
      Card: {
        defaultProps: { radius: 'md', shadow: 'sm' },
        styles: { root: { border: '1px solid rgba(157,108,240,0.4)' } },
      },
      Paper: {
        defaultProps: { radius: 'md' },
        styles: { root: { border: '1px solid rgba(157,108,240,0.25)' } },
      },
      Button: { defaultProps: { radius: 'md', variant: 'gradient' } },
    },
  },
  pop: {
    name: 'Pop',
    description:
      'High-contrast chunky blocks, bright primary, bold borders, colored offset shadow.',
    defaultRadius: 'md',
    autoContrast: true,
    primaryShade: SHADE,
    defaultColorScheme: 'light',
    shadows: {
      xs: '2px 2px 0 rgba(0,0,0,0.18)',
      sm: '4px 4px 0 rgba(0,0,0,0.20)',
      md: '6px 6px 0 rgba(0,0,0,0.22)',
      lg: '8px 8px 0 rgba(0,0,0,0.24)',
      xl: '12px 12px 0 rgba(0,0,0,0.26)',
    },
    components: {
      Card: {
        defaultProps: { shadow: 'md', radius: 'md', withBorder: true },
        styles: { root: { borderWidth: 2 } },
      },
      Paper: { defaultProps: { shadow: 'sm', radius: 'md', withBorder: true } },
      Button: {
        defaultProps: { radius: 'md' },
        styles: { root: { fontWeight: 700 } },
      },
    },
  },
  editorial: {
    name: 'Editorial',
    description: 'Serif headings, squared bordered cards, restrained shadow. Magazine/news/docs.',
    defaultRadius: 'xs',
    autoContrast: true,
    primaryShade: SHADE,
    defaultColorScheme: 'light',
    shadows: {
      xs: '0 1px 0 rgba(0,0,0,0.06)',
      sm: '0 1px 2px rgba(0,0,0,0.08)',
      md: '0 2px 6px rgba(0,0,0,0.10)',
      lg: '0 6px 14px rgba(0,0,0,0.12)',
      xl: '0 10px 24px rgba(0,0,0,0.14)',
    },
    components: {
      Card: {
        defaultProps: { shadow: 'xs', radius: 'xs', withBorder: true },
        styles: { root: { borderWidth: 1 } },
      },
      Paper: {
        defaultProps: { shadow: 'none', radius: 'xs', withBorder: true },
      },
      Button: { defaultProps: { radius: 'xs', variant: 'outline' } },
    },
  },
  storybook: {
    name: 'Storybook',
    description:
      'Warm cream page, very round, soft ink shadows, roomy spacing. Kids/story/bedtime.',
    defaultRadius: 'xl',
    autoContrast: true,
    primaryShade: SHADE,
    defaultColorScheme: 'light',
    white: '#FBF5EA',
    spacing: { xs: '0.75rem', sm: '1.125rem', md: '1.5rem', lg: '2.25rem', xl: '3.5rem' },
    radius: { xs: '8px', sm: '14px', md: '20px', lg: '28px', xl: '40px' },
    shadows: {
      xs: '0 2px 6px rgba(88,54,38,0.06)',
      sm: '0 6px 18px -6px rgba(88,54,38,0.14)',
      md: '0 14px 34px -10px rgba(88,54,38,0.18)',
      lg: '0 26px 60px -16px rgba(88,54,38,0.22)',
      xl: '0 40px 90px -20px rgba(88,54,38,0.26)',
    },
    components: {
      Card: { defaultProps: { shadow: 'sm', radius: 'lg', withBorder: false } },
      Paper: { defaultProps: { shadow: 'xs', radius: 'lg', withBorder: false } },
      Button: { defaultProps: { radius: 'xl', size: 'md' }, styles: { root: { fontWeight: 600 } } },
    },
  },
  stillness: {
    name: 'Stillness',
    description:
      'Bone page, almost no shadow, no borders, very wide spacing. Meditation/journal/sleep.',
    defaultRadius: 'lg',
    autoContrast: true,
    primaryShade: SHADE,
    defaultColorScheme: 'light',
    white: '#F5F2EB',
    spacing: { xs: '0.875rem', sm: '1.375rem', md: '2rem', lg: '3rem', xl: '5rem' },
    radius: { xs: '6px', sm: '12px', md: '18px', lg: '24px', xl: '32px' },
    shadows: {
      xs: 'none',
      sm: '0 2px 10px -4px rgba(60,70,66,0.08)',
      md: '0 8px 24px -10px rgba(60,70,66,0.10)',
      lg: '0 16px 40px -16px rgba(60,70,66,0.12)',
      xl: '0 28px 70px -24px rgba(60,70,66,0.14)',
    },
    components: {
      Card: { defaultProps: { shadow: 'none', radius: 'lg', withBorder: false } },
      Paper: { defaultProps: { shadow: 'none', radius: 'lg', withBorder: false } },
      Button: { defaultProps: { radius: 'xl', variant: 'light', size: 'md' } },
    },
  },
  terminal: {
    name: 'Terminal',
    description:
      'Monospace everywhere, phosphor green on black, square, subtle green glow. CLI/hacker.',
    defaultRadius: '0',
    autoContrast: true,
    primaryShade: SHADE,
    defaultColorScheme: 'dark',
    darkColors: [
      '#d6ffd6',
      '#a6f0a6',
      '#6fd06f',
      '#46b046',
      '#1f7a1f',
      '#155515',
      '#0d2e0d',
      '#0a1a0a',
      '#060f06',
      '#000000',
    ],
    shadows: {
      xs: '0 0 4px rgba(70,200,70,0.25)',
      sm: '0 0 10px rgba(70,200,70,0.30)',
      md: '0 0 18px rgba(70,200,70,0.35)',
      lg: '0 0 28px rgba(70,200,70,0.40)',
      xl: '0 0 44px rgba(70,200,70,0.45)',
    },
    components: {
      Card: {
        defaultProps: { radius: 0, withBorder: true },
        styles: {
          root: { borderColor: 'rgba(70,200,70,0.4)', borderWidth: 1 },
        },
      },
      Paper: {
        defaultProps: { radius: 0, withBorder: true },
        styles: {
          root: { borderColor: 'rgba(70,200,70,0.25)', borderWidth: 1 },
        },
      },
      Button: {
        defaultProps: { radius: 0, variant: 'outline' },
        styles: {
          root: {
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontWeight: 600,
          },
        },
      },
    },
  },
  blueprint: {
    name: 'Blueprint',
    description: 'Thin cyan lines on deep navy, schematic/technical grid. Engineering/data.',
    defaultRadius: 'xs',
    autoContrast: true,
    primaryShade: SHADE,
    defaultColorScheme: 'dark',
    darkColors: [
      '#dbeafe',
      '#bcdcff',
      '#8ec2f5',
      '#5e97d8',
      '#3f6fae',
      '#2c5080',
      '#1d3a5e',
      '#142a45',
      '#0e1f33',
      '#081424',
    ],
    shadows: {
      xs: '0 0 0 1px rgba(94,151,216,0.2)',
      sm: '0 1px 2px rgba(0,0,0,0.3)',
      md: '0 2px 8px rgba(0,0,0,0.35)',
      lg: '0 6px 18px rgba(0,0,0,0.4)',
      xl: '0 12px 32px rgba(0,0,0,0.45)',
    },
    components: {
      Card: {
        defaultProps: { radius: 'xs', withBorder: true },
        styles: {
          root: {
            borderColor: 'rgba(94,151,216,0.4)',
            borderWidth: 1,
            borderStyle: 'dashed',
          },
        },
      },
      Paper: {
        defaultProps: { radius: 'xs', withBorder: true },
        styles: {
          root: { borderColor: 'rgba(94,151,216,0.25)', borderWidth: 1 },
        },
      },
      Button: { defaultProps: { radius: 'xs', variant: 'outline' } },
    },
  },
  monopro: {
    name: 'Mono Pro',
    description: 'Grayscale + single accent, compact dense, crisp small shadows. Pro tools/admin.',
    defaultRadius: 'sm',
    autoContrast: true,
    primaryShade: SHADE,
    defaultColorScheme: 'light',
    shadows: {
      xs: '0 1px 2px rgba(0,0,0,0.08)',
      sm: '0 1px 3px rgba(0,0,0,0.10)',
      md: '0 2px 6px rgba(0,0,0,0.12)',
      lg: '0 4px 10px rgba(0,0,0,0.14)',
      xl: '0 8px 18px rgba(0,0,0,0.18)',
    },
    spacing: { xs: '6px', sm: '10px', md: '14px', lg: '18px', xl: '24px' },
    components: {
      Card: { defaultProps: { shadow: 'xs', radius: 'sm', withBorder: true } },
      Paper: { defaultProps: { shadow: 'xs', radius: 'sm', withBorder: true } },
      Button: { defaultProps: { radius: 'sm' } },
    },
  },
  quorum: {
    name: 'Quorum',
    description:
      'Sober professional: serif headings, hairline green borders, small radius, restrained soft shadows. Finance/tax/legal/civic.',
    defaultRadius: 'sm',
    autoContrast: true,
    primaryShade: SHADE,
    defaultColorScheme: 'light',
    shadows: {
      xs: '0 1px 2px rgba(20,58,44,0.06)',
      sm: '0 2px 6px -2px rgba(20,58,44,0.10)',
      md: '0 6px 18px -6px rgba(20,58,44,0.12)',
      lg: '0 14px 34px -10px rgba(20,58,44,0.16)',
      xl: '0 24px 56px -14px rgba(20,58,44,0.20)',
    },
    components: {
      Card: {
        defaultProps: { shadow: 'sm', radius: 'sm', withBorder: true },
        styles: { root: { borderColor: 'rgba(20,58,44,0.12)' } },
      },
      Paper: {
        defaultProps: { shadow: 'xs', radius: 'sm', withBorder: true },
        styles: { root: { borderColor: 'rgba(20,58,44,0.10)' } },
      },
      Button: { defaultProps: { radius: 'sm' } },
    },
  },
  matrix: {
    name: 'Matrix',
    description: 'Very dark monospace, phosphor green, minimal chrome, subtle glow. Dev tools.',
    defaultRadius: '0',
    autoContrast: true,
    primaryShade: SHADE,
    defaultColorScheme: 'dark',
    darkColors: [
      '#c8ffc8',
      '#7ee87e',
      '#46c246',
      '#2e9e2e',
      '#1c781c',
      '#125212',
      '#0a2e0a',
      '#071a07',
      '#040d04',
      '#000000',
    ],
    shadows: {
      xs: '0 0 4px rgba(46,194,46,0.2)',
      sm: '0 0 8px rgba(46,194,46,0.25)',
      md: '0 0 14px rgba(46,194,46,0.3)',
      lg: '0 0 22px rgba(46,194,46,0.35)',
      xl: '0 0 36px rgba(46,194,46,0.4)',
    },
    components: {
      Card: {
        defaultProps: { radius: 0, withBorder: true },
        styles: {
          root: { borderColor: 'rgba(46,194,46,0.3)', borderWidth: 1 },
        },
      },
      Paper: {
        defaultProps: { radius: 0, withBorder: true },
        styles: {
          root: { borderColor: 'rgba(46,194,46,0.2)', borderWidth: 1 },
        },
      },
      Button: {
        defaultProps: { radius: 0, variant: 'subtle' },
        styles: {
          root: { textTransform: 'uppercase', letterSpacing: '0.05em' },
        },
      },
    },
  },
}

export const BRANDS: Record<string, NamedBrand> = {
  aurora: {
    name: 'Aurora',
    colors: { primary: '#6366f1', secondary: '#a855f7', accent: '#22d3ee' },
    fonts: { heading: 'Sora', body: 'Inter' },
  },
  linear: {
    name: 'Linear',
    colors: { primary: '#6366f1', secondary: '#818cf8', accent: '#a5b4fc' },
    fonts: { heading: 'Inter', body: 'Inter' },
  },
  glass: {
    name: 'Glass',
    colors: { primary: '#38bdf8', secondary: '#22d3ee', accent: '#818cf8' },
    fonts: { heading: 'Inter', body: 'Inter' },
  },
  breeze: {
    name: 'Breeze',
    colors: { primary: '#14b8a6', secondary: '#2dd4bf', accent: '#5eead4' },
    fonts: { heading: 'Nunito', body: 'Nunito' },
  },
  brutalist: {
    name: 'Brutalist',
    colors: { primary: '#f59e0b', secondary: '#facc15', accent: '#ef4444' },
    fonts: { heading: 'Space Grotesk', body: 'Inter' },
  },
  neon: {
    name: 'Neon',
    colors: { primary: '#a855f7', secondary: '#22d3ee', accent: '#f472b6' },
    fonts: { heading: 'Sora', body: 'Inter' },
  },
  pop: {
    name: 'Pop',
    colors: { primary: '#ef4444', secondary: '#f97316', accent: '#facc15' },
    fonts: { heading: 'Poppins', body: 'Inter' },
  },
  editorial: {
    name: 'Editorial',
    colors: { primary: '#b91c1c', secondary: '#78716c', accent: '#ca8a04' },
    fonts: { heading: 'Merriweather', body: 'Inter' },
  },
  terminal: {
    name: 'Terminal',
    colors: { primary: '#22c55e', secondary: '#16a34a', accent: '#4ade80' },
    fonts: { heading: 'JetBrains Mono', body: 'JetBrains Mono' },
  },
  blueprint: {
    name: 'Blueprint',
    colors: { primary: '#38bdf8', secondary: '#60a5fa', accent: '#93c5fd' },
    fonts: { heading: 'Space Mono', body: 'Inter' },
  },
  monopro: {
    name: 'Mono Pro',
    colors: { primary: '#3b82f6', secondary: '#64748b', accent: '#0ea5e9' },
    fonts: { heading: 'Inter', body: 'Inter' },
  },
  matrix: {
    name: 'Matrix',
    colors: { primary: '#22c55e', secondary: '#15803d', accent: '#4ade80' },
    fonts: { heading: 'JetBrains Mono', body: 'JetBrains Mono' },
  },
  quorum: {
    name: 'Quorum',
    colors: { primary: '#2E6F54', secondary: '#C09030', accent: '#4E9B72' },
    fonts: { heading: 'Source Serif 4', body: 'Public Sans', mono: 'IBM Plex Mono' },
  },
  storybook: {
    name: 'Storybook',
    colors: { primary: '#6B4E8F', secondary: '#E0A33E', accent: '#C96A7A' },
    fonts: { heading: 'Baloo 2', body: 'Lora' },
  },
  stillness: {
    name: 'Stillness',
    colors: { primary: '#5E7C74', secondary: '#8FA69B', accent: '#C8A98B' },
    fonts: { heading: 'Spectral', body: 'Karla' },
  },
}

export const PRESETS: Preset[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    description:
      'Modern SaaS: soft indigo→violet gradients, large radius, big diffuse shadows. Dark.',
    tags: ['saas', 'startup', 'dashboard', 'product', 'b2b', 'onboarding', 'ai'],
    brandId: 'aurora',
    structureId: 'aurora',
  },
  {
    id: 'linear',
    name: 'Linear',
    description:
      'Ultra-minimal, hairline borders, near-flat, tight radius. Vercel/Linear feel. Dark.',
    tags: ['productivity', 'issues', 'dev-tools', 'internal-tool', 'minimal', 'project-management'],
    brandId: 'linear',
    structureId: 'linear',
  },
  {
    id: 'glass',
    name: 'Glass',
    description: 'Glassmorphism: translucent blurred panels, soft glow, sky/cyan. Dark.',
    tags: ['dashboard', 'analytics', 'fintech', 'premium', 'crypto', 'metrics'],
    brandId: 'glass',
    structureId: 'glass',
  },
  {
    id: 'breeze',
    name: 'Breeze',
    description: 'Airy pastel teal, big radius, light shadows, no hard borders. Light.',
    tags: ['health', 'wellness', 'booking', 'clinic', 'fitness', 'appointments', 'spa'],
    brandId: 'breeze',
    structureId: 'breeze',
  },
  {
    id: 'brutalist',
    name: 'Brutalist',
    description: 'Square, hard black offset shadows, thick borders, yellow/black. Light.',
    tags: ['marketing', 'agency', 'portfolio', 'landing', 'creative', 'bold'],
    brandId: 'brutalist',
    structureId: 'brutalist',
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Dark with glowing violet/cyan accents on near-black. Gaming/nightlife.',
    tags: ['gaming', 'nightlife', 'music', 'streaming', 'entertainment', 'events', 'crypto'],
    brandId: 'neon',
    structureId: 'neon',
  },
  {
    id: 'pop',
    name: 'Pop',
    description: 'High-contrast chunky blocks, bright red/orange, bold borders. Light.',
    tags: ['marketing', 'campaign', 'sports', 'social', 'community', 'landing'],
    brandId: 'pop',
    structureId: 'pop',
  },
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Serif headings, squared bordered cards, restrained. News/magazine/docs. Light.',
    tags: ['blog', 'news', 'magazine', 'docs', 'publishing', 'content', 'notes'],
    brandId: 'editorial',
    structureId: 'editorial',
  },
  {
    id: 'terminal',
    name: 'Terminal',
    description: 'Monospace phosphor green on black, square, CRT glow. CLI/hacker. Dark.',
    tags: ['dev-tools', 'cli', 'logs', 'monitoring', 'sysadmin', 'hacker', 'observability'],
    brandId: 'terminal',
    structureId: 'terminal',
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    description: 'Thin cyan lines on deep navy, schematic grid. Engineering/data. Dark.',
    tags: ['engineering', 'data', 'iot', 'cad', 'infrastructure', 'analytics', 'technical'],
    brandId: 'blueprint',
    structureId: 'blueprint',
  },
  {
    id: 'monopro',
    name: 'Mono Pro',
    description: 'Grayscale + single blue accent, compact dense, crisp. Pro tools/admin. Light.',
    tags: ['admin', 'console', 'internal-tool', 'data', 'settings', 'enterprise', 'crm'],
    brandId: 'monopro',
    structureId: 'monopro',
  },
  {
    id: 'matrix',
    name: 'Matrix',
    description: 'Very dark monospace, phosphor green, minimal chrome, glow. Dev tools. Dark.',
    tags: ['dev-tools', 'terminal', 'security', 'monitoring', 'data', 'hacker'],
    brandId: 'matrix',
    structureId: 'matrix',
  },
  {
    id: 'storybook',
    name: 'Storybook',
    description:
      'Warm cream page, rounded heading face + serif body, very round, soft ink shadows. Kids/stories/bedtime. Light.',
    tags: [
      'kids',
      'children',
      'story',
      'storybook',
      'bedtime',
      'reading',
      'fairytale',
      'picture-book',
      'family',
      'playful',
      'toys',
      'school-age',
    ],
    brandId: 'storybook',
    structureId: 'storybook',
  },
  {
    id: 'stillness',
    name: 'Stillness',
    description:
      'Bone page, sage + sand, serif headings, almost no shadow, very wide spacing. Meditation/journal/sleep. Light.',
    tags: [
      'meditation',
      'mindfulness',
      'wellbeing',
      'sleep',
      'breathing',
      'journal',
      'diary',
      'therapy',
      'calm',
      'gratitude',
      'mood',
      'habit',
      'yoga',
    ],
    brandId: 'stillness',
    structureId: 'stillness',
  },
  {
    id: 'quorum',
    name: 'Quorum',
    description:
      'Sober professional: forest green + amber, serif headings (Source Serif 4), restrained. Finance/tax/legal/civic. Light.',
    tags: [
      'finance',
      'tax',
      'legal',
      'accounting',
      'civic',
      'government',
      'professional-services',
      'compliance',
    ],
    brandId: 'quorum',
    structureId: 'quorum',
  },
]

export const HIDDEN_PRESET_IDS = new Set<string>([
  'brutalist',
  'pop',
  'editorial',
  'neon',
  'matrix',
])

export const LISTED_PRESETS: Preset[] = PRESETS.filter((p) => !HIDDEN_PRESET_IDS.has(p.id))

export function presetToTheme(preset: Preset): Theme {
  const b = BRANDS[preset.brandId]
  const s = STRUCTURES[preset.structureId]
  return {
    name: preset.name,
    description: preset.description,
    brand: { colors: b.colors, ...(b.fonts ? { fonts: b.fonts } : {}) },
    structure: {
      ...(s.defaultRadius ? { defaultRadius: s.defaultRadius } : {}),
      ...(s.autoContrast != null ? { autoContrast: s.autoContrast } : {}),
      ...(s.primaryShade != null ? { primaryShade: s.primaryShade } : {}),
      ...(s.shadows ? { shadows: s.shadows } : {}),
      ...(s.radius ? { radius: s.radius } : {}),
      ...(s.spacing ? { spacing: s.spacing } : {}),
      ...(s.components ? { components: s.components } : {}),
      ...(s.white ? { white: s.white } : {}),
      ...(s.black ? { black: s.black } : {}),
      ...(s.defaultColorScheme ? { defaultColorScheme: s.defaultColorScheme } : {}),
      ...(s.darkColors ? { darkColors: s.darkColors } : {}),
      defaultGradient: {
        from: 'primary.5',
        to: b.colors.secondary ? 'secondary.6' : 'primary.8',
        deg: 135,
      },
    },
  }
}

# Presets

Each preset pairs a brand and a structure that share its id. `pikku theme list` shows the
**listed** ones; **hidden** ones are left out of the list (they are niche or loud) but
`pikku theme apply --preset <id>` and `--structure <id>` still accept them. The scheme column is
the structure's `defaultColorScheme`; trust it over any "Dark." in a preset's description text.

| id | list | scheme | radius | heading / body | primary | suits |
| --- | --- | --- | --- | --- | --- | --- |
| `aurora` | listed | light | lg | Sora / Inter | `#6366f1` | saas, startup, dashboard, b2b, ai |
| `linear` | listed | light | sm | Inter | `#6366f1` | productivity, issues, dev-tools, internal tools |
| `glass` | listed | light | lg | Inter | `#38bdf8` | dashboard, analytics, fintech, premium |
| `breeze` | listed | light | xl | Nunito | `#14b8a6` | health, wellness, booking, clinic, fitness |
| `monopro` | listed | light | sm | Inter | `#3b82f6` | admin, console, internal tools, CRM, enterprise |
| `quorum` | listed | light | sm | Source Serif 4 / Public Sans | `#2E6F54` | finance, tax, legal, accounting, civic |
| `storybook` | listed | light | xl | Baloo 2 / Lora | `#6B4E8F` | kids, stories, bedtime, family (page `#FBF5EA`) |
| `stillness` | listed | light | lg | Spectral / Karla | `#5E7C74` | meditation, journal, sleep, habit (page `#F5F2EB`) |
| `terminal` | listed | dark | 0 | JetBrains Mono | `#22c55e` | dev-tools, CLI, logs, monitoring |
| `blueprint` | listed | dark | xs | Space Mono / Inter | `#38bdf8` | engineering, data, IoT, infrastructure |
| `brutalist` | hidden | light | 0 | Space Grotesk / Inter | `#f59e0b` | marketing, agency, portfolio, landing |
| `pop` | hidden | light | md | Poppins / Inter | `#ef4444` | campaign, sports, social, community |
| `editorial` | hidden | light | xs | Merriweather / Inter | `#b91c1c` | blog, news, magazine, docs |
| `neon` | hidden | dark | md | Sora / Inter | `#a855f7` | gaming, nightlife, music, events |
| `matrix` | hidden | dark | 0 | JetBrains Mono | `#22c55e` | dev-tools, security, monitoring |

## What a structure carries

| Lever | Key | Effect |
| --- | --- | --- |
| Shadow scale | `shadows.xs`..`xl` | diffuse, hard-offset or glow; the biggest "bespoke" signal |
| Radius | `defaultRadius`, per-component `radius` | square (brutalist, terminal) to pill (breeze, storybook) |
| Borders | per-component `defaultProps.withBorder` / `styles.root` | hairline, thick, dashed, glow |
| Density | `spacing` | compact (monopro) to very wide (stillness) |
| Component defaults | `components.<Name>.defaultProps` | e.g. `Button` `variant: 'gradient'`, `Card` `shadow: 'md'` |
| Scheme | `defaultColorScheme` | light-first or dark-first boot |
| Dark ramp | `darkColors` | exact dark background (true black, deep navy, purple-black) |
| Page and ink | `white`, `black` | light-mode page material and text colour |
| Gradient | `defaultGradient` | on-brand `variant="gradient"`; derived from primary and secondary |

Fonts must be Google Fonts families; the theme package loads them through `googleFontsHref`.

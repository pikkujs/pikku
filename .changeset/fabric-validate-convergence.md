---
'@pikku/cli': patch
---

`pikku fabric validate`: add convergence checks for the canonical frontend stack — every React app must ship i18n (i18next + react-i18next + `useI18n()`/`useTranslation()` usage), must import Mantine components from `@pikku/mantine/core` (not raw `@mantine/core`, which bypasses the i18n-typed compile gate), and each module-singleton-sensitive dep (vite, @tanstack/start-plugin-core, react, react-dom) must resolve to a single physical copy (a second copy splits TanStack Start dev SSR and 404s the frontend).

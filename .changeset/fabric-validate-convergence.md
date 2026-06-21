---
'@pikku/cli': patch
---

`pikku fabric validate`: convergence checks for the canonical frontend stack. Every React app must ship **Paraglide JS** (inlang) for i18n — `@inlang/paraglide-js` plus a wired `messages/<locale>.json` + `project.inlang/settings.json`, with strings routed through `m.*()` / `useLocale()` from the `@/i18n` scaffold. The i18next → Paraglide cutover is hard (no back-compat): a residual `i18next`/`react-i18next` dependency, or a leftover `useTranslation()`/`useI18n()` call or `i18next` import, is now an error. Apps must still import Mantine components from `@pikku/mantine/core` (not raw `@mantine/core`, which bypasses the i18n-typed compile gate), and each module-singleton-sensitive dep (vite, @tanstack/start-plugin-core, react, react-dom) must resolve to a single physical copy (a second copy splits TanStack Start dev SSR and 404s the frontend).

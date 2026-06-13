---
'@pikku/console': patch
---

Switch the console build from vite 6 (Rollup) to rolldown-vite for faster production builds (~6.5× faster locally) and to track the Vite ecosystem's bundler direction. The console now builds on Vite 7, and `@vitejs/plugin-react` is upgraded to v6 so the React transform runs through Oxc instead of Babel.

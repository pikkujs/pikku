---
'@pikku/cli': patch
---

`pikku fabric validate`: warn when a frontend `apps/<name>` does not declare
`@babel/core` in its devDependencies. The scaffolded dev vite config (from
generate-frontend-runtime) imports `@babel/core` to tag JSX with `data-om-id`
for design alt-click editing; it only resolves transitively via
`@vitejs/plugin-react`, so declaring it explicitly stops that resolution from
silently drifting away and breaking the instrumentation.

# starter-template

The Tailwind v4 + shadcn/ui Fabric starter, self-contained: backend (`packages/functions`, `functions-sdk`, `db`,
`emails`, `knowledge`), `apps/app` (TanStack Start) and `packages/theme` (`themes/<id>.json`, `active.json`,
generated `theme.css`). `bunfig.toml` pins bun's hoisted linker; see AGENTS.md for first run.

## The loop

```bash
pikku ui theme apply --preset <id> --primary '#...'   # writes packages/theme/theme.css
npx shadcn@latest add dialog                       # from apps/app; copies into src/components/ui
bun run lint                                        # @shadcn/lint + react/jsx-no-literals
```

UI is `src/components/ui/*` (shadcn, yours to edit) styled by tokens in `theme.css`. Colours the theme has no
field for go in `src/styles/domain.css`. Components with stories are visible in the studio Library view;
bespoke app components belong in `packages/components`.

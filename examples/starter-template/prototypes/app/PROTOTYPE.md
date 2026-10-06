# Prototype rules

This is a throwaway design prototype. Real data and real functions are not used here.

- Stack: React, Tailwind, shadcn style components in `src/ui`, the blocks in `src/blocks`.
- One file per screen in `src/routes` (`bookings.tsx` is `/bookings`). The route tree is generated; never edit `routeTree.gen.ts`.
- Add every screen to the `nav` array in `src/routes/__root.tsx`.
- Read data only with `usePikkuQuery('functionName', input)` and write with `usePikkuMutation('functionName')` from `@/lib/pikku`. Each name needs a file `src/mocks/functionName.ts` whose default export returns realistic sample data.
- Compose screens from the blocks. Add a new block to `src/blocks` only when two screens need it.
- Colours, type and radius come from the shared theme tokens (`@project/theme`), the same as the real app. Use token classes (`bg-primary`, `text-muted-foreground`); never literal colours.
- No i18n, no auth, no backend, no real network calls.

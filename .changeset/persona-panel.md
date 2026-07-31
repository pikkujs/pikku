---
'@pikku/console': patch
---

Open a persona in the panel instead of a drawer.

Clicking a persona — from a feature's cast or the personas list — slid a
right-hand `Drawer` over the screen. That ignored wherever the surrounding app
actually puts detail surfaces, so an embedding host got a drawer across its own
end-edge panel, and the console got a second overlay competing with the pane it
already has.

Personas are now a panel type like every other detail: `openPersona(key, title,
{ persona, onOpenScenario })` from `usePanelContext`, rendered by
`PanelContainer` as the new exported `PersonaDetail`. `PersonaDrawer` is gone —
it had no callers outside the two this replaces.

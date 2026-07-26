---
'@pikku/console': patch
---

Give the addons gallery stable test hooks: `data-testid="addon-card"` with `data-addon-package` and `data-addon-installed` on each card, and `data-testid="packages-search"` on the search field.

Selecting a card previously meant reaching for an unexported Mantine card class, and selecting the filters meant matching the translated copy those controls render — so a copy change or a Mantine bump silently broke the browser tests. The names carry the addon's package and installed state, which is what the assertions actually want.

---
'@pikku/console': patch
---

Give each avatar in a scenario card's cast a `data-testid="flow-cast-member"` and a `data-persona-key`, so a test can assert who a scenario is cast with. The cast renders as avatars with no accessible name, which previously left the casting unassertable without matching on how an avatar happens to look.

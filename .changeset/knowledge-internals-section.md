---
'@pikku/knowledge': patch
---

Add `decisions/internals` to the knowledge section profile.

`decisions/design` describes "a rule about how the app looks and behaves", which
is the right question for an app project and the wrong one for a library: none of
the reasoning behind `@pikku/core` is about how anything looks. A library filing
its notes under `design/` reads as UI design to everyone who opens the directory.

`decisions/internals` — "a rule about how it works under the hood, and why" — is
the section for that material. `decisions/design` is unchanged and stays the
right home for app projects.

Sections outside the profile are not an error, but they lose their description in
the parent index and their position in the section ordering, so a section worth
using is worth registering.

---
'@pikku/knowledge': patch
'@pikku/cli': patch
---

`pikku validate` no longer reports scaffold-generated functions and framework tables as "exists in the code and no note describes it". A function whose source is scaffold output or a `.gen.` file, and a table a generated migration creates (Better Auth, the runtime services, an addon), are put in the project by the platform, so there is nothing for a note to say about them; a fresh starter reported about 75 of these. The app's own functions and tables are still reported.

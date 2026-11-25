---
'@pikku/cli': patch
'@pikku/skills': patch
---

The site capture opens each embedded frame of a page where it is, read-only, and records under `frames` its title, text and choices, its forms and fields with an empty submit held back, and the hosts it loads from. A site plan evidences a form or flow inside an embedded service by `behaviour:frames`, not by a page fetched with curl.

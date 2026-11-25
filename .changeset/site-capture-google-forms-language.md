---
'@pikku/cli': patch
'@pikku/skills': patch
---

A Google Form a page links to is captured in the site's own language: Google Forms picks its language from where the request comes from rather than Accept-Language, so the capture asks for it with `hl`.

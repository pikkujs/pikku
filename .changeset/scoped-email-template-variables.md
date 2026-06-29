---
'@pikku/cli': patch
---

fix(emails): scope generated template variables to each template. The email codegen fed every string in the shared locale file into every template's variable list, so a variable interpolated by one template's locale string (e.g. `inviterName` in an invitation subject) leaked into the typed `data` of unrelated templates. Variables are now collected only from the locale keys and partials each template actually references (transitively).

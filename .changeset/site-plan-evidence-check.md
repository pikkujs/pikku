---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku changes file --plan` checks a site plan's evidence against the capture: every `page:`, `behaviour:` and `note:` citation must exist, no line rests on a note alone, every outside host and sibling app is named by a change, and no change captures the original again. The first failure refuses the filing with the exact list; a second is filed with what is still wrong as an open question in the first change. Before filing, site archaeology asks the person one question about the site's own other apps (default: out of scope, kept as links); the intake prompt allows that one question.

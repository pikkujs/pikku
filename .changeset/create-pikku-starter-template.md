---
'create-pikku': patch
---

The default template is downloaded from `pikkujs/starter-template` at a pinned commit, so the project directory is populated. For the starter, `--version` names a ref of that repository. A downloaded template that is empty or has no `package.json` makes `create-pikku` exit with a non-zero status without creating a project. Each run downloads into a new directory inside the project and removes it afterwards.

---
'create-pikku': patch
---

The default template is downloaded from `pikkujs/starter-template` at a pinned commit, so the project directory is populated. For the starter, `--version` names a ref of that repository. A downloaded template that is empty or has no `package.json` makes `create-pikku` exit with a non-zero status without creating a project. Each run downloads into a new directory inside the project and removes it afterwards.

The starter template is installed, set up and started with Bun. It refuses `--yarn-link` and any `--package-manager` other than `bun`, and stops with a message when it is going to install and `bun` cannot be run. The next steps it prints use Bun and include creating the database, which `create-pikku` does not do itself. For every template, a failed install or setup step makes `create-pikku` exit with a non-zero status instead of reporting the setup as complete.

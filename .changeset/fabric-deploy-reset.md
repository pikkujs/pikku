---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku fabric deploy apply --reset` wipes a disposable stage's database and rebuilds it from the migrations and the dev seed as part of the deploy. It refuses production/`main` and `--deployment-id`, asks first (naming the app, the stage and that all data is wiped; `-y` skips the prompt but still prints it), and fails without wiping anything when the fabric server does not report the reset.

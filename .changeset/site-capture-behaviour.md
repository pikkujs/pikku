---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku ui pages capture` first records what every page relies on and does, once per page at 1440 px: outside hosts and what each loads, redirects, response headers, console messages and script errors, cookies by name and storage keys, loaded fonts and media, the accessibility tree, every form with its field types, options and the controls beside them, an empty submit held back so nothing is sent, and hover, focus, open and scroll states before and after with transitions and animations. It writes `<id>.behaviour.json` per page, opener pictures under `interactions/`, and `behaviour.json`, the site's summary with robots.txt. Site archaeology reads it into `forms.md`, `interactions.md` and `outside-services.md`, and a clone's plan carries the behaviour and the form fields into its changes.

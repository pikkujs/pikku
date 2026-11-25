---
'@pikku/cli': patch
'@pikku/skills': patch
---

The site capture lists the payment providers the site's own pages use under `payments` in `behaviour.json` (their links, and scripts or requests from the page itself, not from another provider's embedded frame), and keeps a CMS's own machinery (`/wp-json`, `/wp-content`, feeds) and files such as fonts and audio out of the page list.

---
'@pikku/console': patch
---

Make the sidebar, the run form and the impersonation surface addressable from a test without reading translated copy back.

Nav sections gain an optional stable `id`, and the accordion now tracks which section is open by that id rather than by the section's rendered title — so the open section survives a locale change. Sections and nav links carry `nav-section`/`nav-link` with the key declared in code (the section id, the link's route), which replaces selecting a section by an `aria-expanded` heuristic and a link by its label.

The schema form and its submit button, the runs panel's new-run button, the impersonation banner and its stop button, the impersonate drawer's search and rows, and the sidebar's impersonate button all carry test ids. None of them carries a user's email: an email is personal data, and putting it in a `data-` attribute publishes it to anything reading the DOM for the sake of a selector — rows are matched on the email they already render.

The workflow runs panel's empty and new-run labels move from `asI18n` string literals onto `messages/en.json` keys, so they translate with the rest of the console, and the impersonate drawer's row moves into its own file.

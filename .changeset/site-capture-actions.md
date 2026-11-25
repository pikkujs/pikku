---
'@pikku/cli': patch
'@pikku/skills': patch
---

The site capture opens the first step of each flow a page starts (Book, Enroll, Get Tickets, Buy, Apply, Log In, Subscribe), read-only with every non-GET request held back, and records where it lands and what it asks for under `actions`; a page builder's form beside a real form is no longer missed, and a form every page shares is listed once with its pages. A site plan evidences a flow's first step, or a member area, by `behaviour:actions`.

---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku fabric changes reply <id> --message "…" [--image path]` posts on an item's thread without asking (which parks it) or closing it (`done --note`) — for "not doing this, because…" or "blocked on X". `next` is now woken by fabric's `changes:<projectId>` events, re-reading the list on each one, with a three-minute safety poll while subscribed and the `--interval` poll with backoff when the stream is down; it sleeps exactly until the soonest held item becomes claimable. `list`, `show` and a refused `claim` print when a held or leased item is claimable. Short ids are looked up by fabric instead of by listing the project's oldest 200 items. Needs the matching fabric-api release.

`reply`, `ask` (question and each `--option`) and `file --title` now refuse blank text and send it trimmed. Their `.trim().min(1)` input schemas never ran: the CLI enforces no input schema at runtime, so `ask --question "   "` posted an empty question.

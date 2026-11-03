---
'@pikku/openapi-parser': patch
'@pikku/code-edit': patch
'@pikku/cli': patch
---

Security: stop OpenAPI spec titles, versions and tag names from breaking out of generated comments; restrict agent-config edits to known keys and escape their values; refuse addon server URLs containing line breaks before writing them to `.env`.

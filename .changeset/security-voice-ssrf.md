---
"@pikku/ai-voice": patch
---

Restrict audio URL fetching to HTTP(S) only and enforce a 50MB size limit to prevent SSRF and memory exhaustion.

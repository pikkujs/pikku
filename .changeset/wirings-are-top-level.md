---
'@pikku/inspector-go': patch
'@pikku/inspector': patch
'@pikku/skills': patch
---

A Pikku `wire*` call (`wireHTTP`, `wireChannel`, `wireContributors`, `wireAddon`, `wireRemoteAddon` and the rest) inside a function is now a critical diagnostic, PKU367. Calls at the top level of a file are unchanged. Move the call out of the function; a wiring that depends on a name only a function knows has to be declared once per name instead.

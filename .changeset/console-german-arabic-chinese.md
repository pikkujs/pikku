---
'@pikku/console': patch
---

Ship German, Arabic and Chinese alongside English.

The console has been message-complete since the Paraglide migration but shipped one catalogue, so every consumer that mounts a console surface fell back to English regardless of the locale it had already resolved. `messages/{de,ar,zh}.json` cover all 964 keys, and `project.inlang/settings.json` lists the three codes — nothing else changes, because `supportedLocales`, the `/<lang>` URL prefix and `localeDir()`'s RTL set all derive from that list. Arabic was the one that needed checking rather than adding: `ar` was already in `RTL_LOCALES`, so `<html dir>` and Mantine's mirroring were waiting on a catalogue, not on code.

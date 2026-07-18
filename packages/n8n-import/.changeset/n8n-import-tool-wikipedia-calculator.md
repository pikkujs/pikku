---
'@pikku/n8n-import': patch
---

Map n8n's LangChain `toolWikipedia` and `toolCalculator` agent tools to their
dep-free Pikku addons — `wikipedia:search` (@pikku/addon-wikipedia) and
`math:evaluate` (@pikku/addon-math) — as direct addon refs instead of throwing
stubs. The addon's own schema/description drive the LLM tool. Corpus clean
1091 → 1102.

---
'@pikku/n8n-import': patch
---

Resolve n8n `<service>Tool` agent-tool variants (baserowTool, openWeatherMapTool,
airtopTool, …) to their base service node's addon rpc. `integrationSpecFor` now
falls back to the base entry when a `<service>tool` key isn't explicitly mapped,
so any tool variant of an already-mapped integration refs the same addon
(`baserow:rowGetAll`, `open-weather-map:currentWeather`, …) instead of emitting a
stub. The langchain `tool*`-prefixed nodes are unaffected. Corpus clean
1102 → 1103.

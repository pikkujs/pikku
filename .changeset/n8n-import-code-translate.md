---
'@pikku/n8n-import': patch
---

Translate pure n8n Code / Function nodes into real Pikku functions instead of throwing stubs. Self-contained JavaScript (runOnceForAllItems and runOnceForEachItem) is lowered 1:1 with a rebuilt `$input`/`$json`/`items` shim over the node's own input; anything that reaches outside itself — `require`, another node (`$node`/`$(...)`), `$env`, the network, or `await` — stays a stub for the code-translate skill to finish. Across the corpus this translates ~66% of Code nodes and moves the fully-stub-free (publishable) share from ~33% to ~41%.

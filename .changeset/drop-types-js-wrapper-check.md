---
'@pikku/cli': patch
---

`pikku validate` no longer warns that `packages/functions/.pikku/function/index.js` is missing. The check dated from the old sandbox that ran `pikku dev` under bare Node and needed a `.js` wrapper beside each generated `.ts`; the file is gitignored and nothing in `pikku all` or `pikku cloud smoke` creates it, so every fresh checkout, the starter template included, carried the warning.

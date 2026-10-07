---
'@pikku/code-edit': patch
'@pikku/addon-console': patch
---

`@pikku/shadcdn` is gone, and so is the hand-rolled shadcn installer. Components are added with the shadcn CLI (`npx shadcn add`); `ShadcnCatalog` only reads what the app already has (`componentNames`, `componentMeta`, with a cva parser that now lives in code-edit). The console's `listBlocks` and `getBlock` functions and the block library behind them are removed.

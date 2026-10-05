---
'@pikku/cli': patch
'@pikku/addon-console': patch
---

addon-console reads and files a project's changes and the setup wish list (`getStudioHost`, `listStudioChanges`, `createStudioChange`, `replyToStudioChange`, `setStudioChangeStatus`, `completeStudioChange`, `listStudioWishes`, `reactToStudioWish`), locally or against Fabric. `@pikku/cli` exports `@pikku/cli/fabric` for the Fabric client it uses.

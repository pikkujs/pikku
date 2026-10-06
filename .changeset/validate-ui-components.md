---
'@pikku/cli': patch
---

`pikku validate` checks the components the shadcn CLI copies into `src/components/ui`: literal text (`component-literal-string`) and physical `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`/`text-left`/`rounded-l`/`border-l` classes (`component-physical-class`) are errors, with the logical class named in the fix hint.

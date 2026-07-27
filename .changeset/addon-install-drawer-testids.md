---
'@pikku/console': patch
---

Give the addon install drawer test ids: the instance-name field, the add-to-project button and the inline install error. The error alert in particular had no handle, so asserting that a name conflict surfaces cleanly rather than as a raw 500 meant matching on rendered copy.

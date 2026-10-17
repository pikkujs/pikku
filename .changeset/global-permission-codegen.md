---
'@pikku/inspector': patch
'@pikku/cli': patch
---

`addGlobalPermission` registrations now reach the runtime. The inspector never recorded them, and the generated `pikku-permissions.gen.ts` imported nothing, so a file whose only job was `addGlobalPermission([...])` was never loaded and every function ran without that global gate. The inspector records each call in `permissions.global`. The generated permissions file imports each file for its side effect, or imports and calls the exported zero-argument factory the call sits in. A permission written inline in the global array is no longer reported as unassigned. The services used by global permissions and global middleware are now counted as required.

---
'@pikku/inspector': patch
'@pikku/cli': patch
---

`addGlobalPermission` registrations now reach the runtime. The inspector never recorded them, and the generated `pikku-permissions.gen.ts` imported nothing, so a file whose only job was `addGlobalPermission([...])` was never loaded and every function ran without that global gate. The inspector records each call in `permissions.global`. The generated permissions file imports each file for its side effect, or imports and calls the exported zero-argument factory the call sits in. A permission written inline in the global array is no longer reported as unassigned. The services used by global permissions and global middleware are now counted as required.

A factory is found in every common shape: an exported arrow with a block body, an exported `function` declaration, and a function exported through an `export { }` list. A call inside any other function that nothing calls (not exported, takes a parameter, or a default export) is no longer recorded as if it ran; the inspector warns that the global permission is not registered. `addGlobalPermission` also follows a `const` array or object, declared in the file or imported, instead of giving up on anything but a literal, so the services its permissions use are counted. The generated file imports each factory under its own alias, so two files that export a factory of the same name both register.

---
'@pikku/core': patch
---

Fix the agent tool-list permission filter failing open.

`buildToolDefs` filtered permission-gated tools by resolving `checkAuthPermissions` from a function's _metadata_ — a by-name lookup into the `misc/permissions` state that nothing ever populates. It therefore collected no predicate and returned `true`, so every auth-gated tool was offered to the model regardless of session (its input schema and description leaked, and the model could attempt calls that then failed at invocation).

`checkAuthPermissions` now takes the live `CorePermissionGroup` from the function/agent config, where the `pikkuAuth` brand actually survives — matching how the agent's own gate and the function runner already resolve permissions by reference. The dead by-name lookup (`getPermissionByName`) is removed. Enforcement on invocation was never affected; this closes the exposure gap in the offered tool list.

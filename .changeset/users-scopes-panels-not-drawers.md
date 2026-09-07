---
'@pikku/console': patch
---

The user-directory and scope surfaces open as end-edge panels rather than
drawers: `CreateUserPanel`, `UserActionPanel`, `UserRolesPanel` and
`RoleEditorPanel` replace the four drawers of the same name, so the page card
shrinks beside them instead of being covered by a scrim. `UserRolesPanel` is now
exported, for a host that mounts the directory itself.

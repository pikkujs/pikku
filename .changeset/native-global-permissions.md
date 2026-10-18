---
'@pikku/inspector-go': patch
---

The native inspector records `addGlobalPermission` registrations in `permissions.global` the way `@pikku/inspector` does (#2148): inline permissions are named after where they sit, a const or imported argument is followed to its literal, an exported zero-argument factory is recorded by name, and a call nothing runs is warned about rather than recorded. What global permissions and global middleware use counts toward `requiredServices`.

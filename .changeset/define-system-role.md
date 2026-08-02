---
'@pikku/inspector': minor
'@pikku/core': minor
'@pikku/cli': minor
---

Add `defineSystemRole()`: roles that ship with the product, declared in code.

A system role is to a console-composed role what an AWS managed policy is to a
customer-managed one — the console may show and grant it, but not rename,
re-scope or delete it. The CLI extracts declarations by AST and generates a
`SystemRoleName` union, so naming a role that does not exist fails the build,
and a role granting a scope no `defineScope` declares fails it too.

Removal is additive on the same terms as `defineScope`: deleting a declaration
leaves an inert row rather than revoking everyone's grant mid-deploy.

`ScopeService` gains `syncSystemRoles`, `findStaleSystemRoles` and
`pruneSystemRoles`; `Role` gains `system` and `declared`. Implementations
enforce immutability through the shared `assertRoleIsMutable` /
`assertRoleNameAvailable` guards rather than each inventing the rule.

---
type: overview
title: Decisions
description: Who may read the audit trail and the scope vocabulary, and which way those reads fail
---

# Decisions

<!-- pikku:knowledge-index -->
- [Sending a sign-in link is gated by admin:users:create, not by a scope of its own](a-sign-in-link-is-gated-by-admin-users-create.md) — The sendSignInLink function reuses admin:users:create because the link goes only to the user's own inbox and is weaker than admin:users:password
- [The admin root stays off the addon so each function carries its own scope](admin-root-stays-off-the-addon-so-each-function-carries-its-own-scope.md) — The admin scope tree in scopes.ts is not declared on the addon's wireAddon, because verifyScopes is a conjunction, and it must match the better-auth copy of the same tree
- [An admin cannot remove their own account](an-admin-cannot-remove-their-own-account.md) — remove-user refuses a request whose userId is the caller's own before deleting, under admin:users:remove, and the delete also clears sessions and linked accounts
- [An admin sets a user's password out of band under admin:users:password](an-admin-sets-a-users-password-without-the-users-reset-flow.md) — set-user-password writes a password directly for a named user, enforcing the length bounds, and creates a credential account for a user who has none
- [An audit sink that cannot be read reports readable false, not an empty trail](an-unreadable-audit-sink-reports-readable-false-not-an-empty-trail.md) — getAudits returns readable false with no events when the configured sink has no query, so a write-only sink is never shown as "nothing happened
- [Audit readers see account names because the trail is resolved through the server-side adapter](audit-readers-see-account-names-through-the-server-side-adapter.md) — resolveAuditUsers reads user rows as the server, so anyone holding admin:audit:read is shown names, emails and the virtual user flag for the users in the trail
- [Feature flag reads degrade to read-only for provider-backed sources](feature-flag-reads-degrade-to-read-only-for-provider-sources.md) — flag-list is gated by admin:flags:read and returns a read-only listing, rather than failing, when the wired flag service is a third-party provider
- [Feature flag writes need admin:flags:manage and record the caller](feature-flag-writes-need-manage-and-record-the-caller.md) — Every flag write function is gated by admin:flags:manage, and the switch, rollout and override paths pass the caller's userId to the store, while clearing an override does not
- [Role grants are limited to declared scopes by a database foreign key, not by createRole](role-scopes-are-limited-to-declared-scopes-by-a-foreign-key.md) — scopeCreateRole does not check scope ids itself; pikkuRoleScopes has a foreign key into pikkuScopes, and the database refuses a grant of a scope that was never declared
- [The audit filter vocabulary is not narrowed by the current query](the-audit-filter-vocabulary-is-not-narrowed-by-the-current-query.md) — getAuditFilters lists every user id and event type in the trail, not only those on the page being shown, so the filter lists can reach the whole trail
- [The host supplies the admin services and the addon builds none of them](the-host-supplies-the-admin-services-and-the-addon-builds-none.md) — services.ts forwards the scope, credential, audit, auth, flag and trigger stores from the host, and constructs nothing, so the addon cannot run its own audit sink or scope service
- [The ping probe has no scopes, so any answer other than 404 means wired](the-ping-probe-has-no-scopes-so-any-answer-but-404-means-wired.md) — The admin ping function is exposed without a scope key so that a narrowed grant cannot turn its answer into a 403, and the console reads 401 or 403 as installed
- [The user directory hides non-person principals in the query and gates roles on admin:scopes:read](the-user-directory-hides-non-person-principals-in-the-query.md) — list-users excludes platform and synthetic user ids with a NOT IN clause and filters again after the read, and it refuses includeRoles to a caller without admin:scopes:read
- [Trigger source functions are gated by admin:triggers:manage, and the list by admin:triggers:read](trigger-source-functions-are-gated-by-manage-or-read-scope.md) — Setting up, removing, disabling and forgetting trigger sources all need admin:triggers:manage, and only listing needs the read scope; forget leaves the provider registration in place
<!-- /pikku:knowledge-index -->

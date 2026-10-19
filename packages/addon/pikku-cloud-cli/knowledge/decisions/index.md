---
type: overview
title: Decisions
description: Rules chosen in the pikku cloud commands, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [The change-events stream sends the bearer token and stops retrying on 401 and 403](changes-stream-treats-auth-failures-as-permanent.md) — subscribeToChanges sends the Pikku Studio Cloud token on each connection and treats 401, 403, 404, 405 and 501 as permanent, falling back to polling
- [Cloud deploy-unit reads refuse without a CLI login and a linked project](cloud-deploy-unit-reads-need-login-and-link.md) — The CloudDeployUnits function throws a precondition error when there is no token or no linked project before it lists workers for a branch
- [pikku cloud init refuses to re-link a remote-linked project and replaces a local link only with force](cloud-init-refuses-to-relink-a-remote-project.md) — pikku cloud init throws when a remote-linked project already exists, and when a local link exists it throws unless force is passed
- [pikku cloud link never creates a GitHub repository and asks before creating one on Pikku Studio Cloud](cloud-link-never-creates-a-github-repository.md) — With no origin, link refuses --github, and otherwise either requires --gitea or asks the user before creating a repository on Pikku Studio Cloud's git server
- [pikku cloud login registers a git credential helper for the cloud git host only](cloud-login-registers-a-host-scoped-git-helper.md) — Login adds one credential helper line scoped to the cloud git host, so git push there authenticates with the login; logout removes that line and nothing else
- [pikku cloud login makes the person type the code instead of linking it](cloud-login-types-the-code-instead-of-linking-it.md) — pikku cloud login prints a one-time code and opens the console page without the code in the URL, so the person who runs the command is the one who approves it
- [pikku cloud publish verifies the addon before packing, and sends the logged-in token only to the registry](cloud-publish-verifies-before-it-packs-and-sends-the-login-token.md) — The publish function runs addon verification first, requires a stored login and package name and version, then uploads through a presigned URL that carries no auth header
- [Pikku Studio Cloud secret values are sealed to the stage key before upload](cloud-secret-values-are-sealed-before-upload.md) — pikku cloud secrets set encrypts the value to the stage public key on the local machine, so Pikku Studio Cloud stores only ciphertext
- [pikku cloud secrets list shows names and timestamps, never values](cloud-secrets-list-shows-names-and-times-only.md) — pikku cloud secrets list asks the stage for names and updated times, and the values stay sealed to the stage
- [Pikku Studio Cloud tokens live in ~/.pikkustudio/auth.json, keyed by API URL, written with mode 0600](cloud-tokens-live-in-auth-json-keyed-by-api-url.md) — The cloud CLI keeps one token per API URL and a defaultApiUrl in a single file, written with owner-only permissions
- [Destructive Pikku Studio Cloud secret commands refuse to run without --force](destructive-cloud-secret-commands-need-force.md) — secrets rotate refuses without --force, and secrets delete refuses without --force when stdin is not a terminal; both say the value cannot be read back
- [Findings are held locally and sent only after an explicit yes or always](findings-are-sent-only-on-yes-or-always.md) — The cloud report function holds each finding, sends only when the answer is yes or always, and asks the user on a terminal or prints a request when there is none
- [The cloud llm-key command prints the proxy API key to stdout in every format](llm-key-prints-the-api-key-to-stdout.md) — pikku cloud llm-key needs a stored login, then prints the LiteLLM proxy URL and API key as text, env, shell or JSON on stdout
- [Missing-config hints send secret gaps to secrets set and variable gaps to variables set](missing-config-hints-route-secrets-and-variables-apart.md) — missingConfigHints names pikku cloud secrets set for missing secrets and pikku cloud variables set for missing variables, in separate hints
- [A --organization value resolves to one id, and an ambiguous name is refused](organization-flag-is-resolved-and-ambiguity-refused.md) — resolveOrganizationId passes UUIDs through, matches a name or slug against the caller's organizations, and refuses both an unknown and an ambiguous value; with no flag it returns undefined and Pikku Studio Cloud derives the org from the session
- [A git remote is compared as host and path with credentials dropped](remote-urls-are-compared-without-credentials.md) — normalizeRepoUrl reduces an ssh or https remote to lowercase host and path, so embedded credentials never take part in matching a repo to a project
- [Report consent is a per-person 0600 file, and PIKKU_REPORT overrides it](report-consent-is-one-0600-file-per-person.md) — The cloud report consent answer lives in one JSON file under the home directory written with mode 0600, and the PIKKU_REPORT environment variable overrides it for CI
- [The deploy reset flag refuses production and any attached deployment at input validation](reset-is-refused-for-production-and-attached-deployments.md) — pikku cloud deploy with reset is checked when the input is parsed, refusing the main branch, production, and a --deployment-id target, and the check runs again once the branch is known
- [Stage variables are sent and read back in plain form, and anything that must not print goes to secrets](stage-variables-are-plain-and-secrets-are-sealed.md) — pikku cloud variables set sends the value unsealed and does not prompt, so a variable can be read back, and the comment directs sensitive values to secrets set
- [The terminal secret prompt echoes the typed value](terminal-secret-prompt-echoes-what-is-typed.md) — promptSecret on a terminal uses readline with output to stdout and no echo suppression, so a typed secret is visible on screen
- [CLI user add creates end users on a deployed stage with a per-call operator token](user-add-calls-the-stage-admin-rpc-with-a-per-call-token.md) — pikku cloud user add mints a short-lived operator token for the stage and posts admin:createUser to the stage's /api/rpc endpoint directly, without a broker
- [Writing Pikku Studio Cloud project settings requires a stored login and a linked project](writing-cloud-settings-needs-a-login-and-a-link.md) — pikku cloud config refuses a settings write without a token or a linked project, while a settings read is best effort and reports its error instead of failing
<!-- /pikku:knowledge-index -->

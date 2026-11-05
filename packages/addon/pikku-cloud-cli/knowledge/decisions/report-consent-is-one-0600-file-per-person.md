---
type: decision
title: Report consent is a per-person 0600 file, PIKKU_REPORT overrides it, and failing to save it is a warning
description: The pikku report consent answer lives in one JSON file under the home directory written with mode 0600, PIKKU_REPORT overrides it for CI and sandboxes, and a home that cannot be written downgrades always and never to this run with a warning
tags: cli, report, consent
---

# Report consent is a per-person 0600 file, PIKKU_REPORT overrides it, and failing to save it is a warning

`packages/addon/pikku-cloud-cli/src/lib/report.ts` keeps the answer about sending findings on the person's
machine. Consent belongs to the person, so it is not stored in a committed project config.

The file is `PIKKUSTUDIO_REPORT_CONSENT_FILE` or `~/.pikkustudio/report-consent.json`.
`PIKKU_REPORT` set to `always` or `never` is returned before the file is read, because CI and
sandboxes have no one to answer. A missing or unreadable file returns `null`, which means ask.

`saveConsent` writes the file with mode `0o600`, and only for `always` and `never`. `yes` and `no`
write nothing here, so they work from a sandbox whose home is read-only. There, saving `always` or
`never` fails with `EPERM`: `report.function.ts` turns that into a warning that names `PIKKU_REPORT`,
returns it in `warnings`, and applies the answer to the current run only.

**What this rules out:** storing report consent in a project file that is committed, sharing one
answer between machines, widening a sandbox so that it can save the answer, and crashing because
it could not.

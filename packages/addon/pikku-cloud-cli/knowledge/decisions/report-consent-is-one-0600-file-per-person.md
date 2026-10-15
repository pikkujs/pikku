---
type: decision
title: Report consent is a per-person 0600 file, and PIKKU_REPORT overrides it
description: The cloud report consent answer lives in one JSON file under the home directory written with mode 0600, and the PIKKU_REPORT environment variable overrides it for CI
tags: cli, cloud, report, consent
---

# Report consent is a per-person 0600 file, and PIKKU_REPORT overrides it

`packages/addon/pikku-cloud-cli/src/lib/report.ts` keeps the answer about sending findings on the person's
machine. The comment says consent belongs to the person, so it is not stored in a committed
project config (`report.ts:25-28`).

The file is `PIKKUSTUDIO_REPORT_CONSENT_FILE` or `~/.pikkustudio/report-consent.json`
(`report.ts:17-22`). `PIKKU_REPORT` set to `always` or `never` is returned before the file is
read, and the comment says it exists for CI and sandboxes where no one can answer
(`report.ts:29-31`). A missing or unreadable file returns `null`, which means ask
(`report.ts:33-39`, and the type comment at `report.ts:6-9`).

`saveConsent` writes the file with mode `0o600` (`report.ts:42-50`).

**What this rules out:** storing report consent in a project file that is committed, and sharing
one answer between machines.

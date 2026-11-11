---
type: question
title: Should the retention job run by default, with 14 days and a 2 GB cap?
description: plan 4.5 wanted 14 days and a 2 GB cap by default; the addon runs the job only when PIKKU_GREPTIME_RETENTION_DAYS is set because Studio is meant to schedule it
tags: [retention, defaults]
---

# Should the retention job run by default, with 14 days and a 2 GB cap?

Plan 4.5 wanted telemetry kept 14 days with a 2 GB disk cap, without being asked. The
addon has the job (`startRetentionJob`, `runRetention`: 14 days and 2048 MiB are their
defaults) but an app starts it only when `PIKKU_GREPTIME_RETENTION_DAYS` is set, on the
author's reading that Studio schedules `runRetention` itself. With neither, nothing ever
deletes telemetry and the disk grows without bound. A default-on job is fail-safe for
the disk; default-off is what the Studio-schedules reading needs. Needs an owner decision.

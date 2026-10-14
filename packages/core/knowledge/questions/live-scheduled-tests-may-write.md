---
type: question
title: May a scheduled test on live change data?
description: Scheduled runs against a live app may only read, or may write with an explicit per-schedule approval; the choice is not made
tags: workflow, services
---

# May a scheduled test on live change data?

A scheduled test runs in a live app as a test account that has the same access as
a real role, so it can change real data. Options proposed, none chosen:
- read-only by default, with writes allowed only by an explicit approval recorded
  on each schedule;
- writes allowed on schedules the admin marks as writing, with a warning shown
  before saving;
- no writes on live at all, with the same tests run only on staging.

The answer also decides what the failure notice must say when a write test stops
partway.

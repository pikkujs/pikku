---
type: entity
title: Report
description: The thing behind the scope gate, and the only reason the gate is observable
resource: func:getReport
tags: scopes
---

# Report

A report is the harness's stand-in for anything worth protecting. It has no
fields, no table and no history — it is one string, `quarterly numbers`, and
that is deliberate: the report exists so that a scope gate has something to
guard, and every byte of shape it gained would be a byte the scope suites have
to carry without learning anything from it.

So "a report" in this project means: _the payload a caller either receives or is
refused_. When a scenario says a caller read the report, it is asserting on the
gate, not on reporting.

See [only report-viewers read a report](../decisions/security/only-report-viewers-read-a-report.md)
for who may have it.

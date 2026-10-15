---
type: overview
title: Decisions
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [An approval answer with no run id is dropped, and a failed acknowledgement of an earlier approval is only logged](an-approval-without-a-run-id-is-dropped-and-a-failed-resume-is-only-logged.md) — handleApproval returns false for an unknown approval or one with no runId, and for a batch it reports true even when the resume request threw
<!-- /pikku:knowledge-index -->

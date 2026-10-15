---
type: decision
title: A mixed, empty or unmatched spoken answer is unclear, not consent
description: interpretConsent returns unclear when the answer has both a grant and a denial, or when it is empty or matches neither list
tags: [voice-agents, approval, consent]
---

# A mixed, empty or unmatched spoken answer is unclear, not consent

`interpretConsent` in `packages/voice-agents/src/spoken-approval.ts` (lines 181-192) normalises the
transcript (line 182) and returns `unclear` when it is empty (line 183).

It removes grant phrases first, then denial phrases from what is left (lines 185-186). It returns
`unclear` when both were found (line 188), `denied` when only denials were found (line 189), `granted`
when only grants were found (line 190), and `unclear` otherwise (line 191).

The doc comment at lines 175-179 says asking again "costs a sentence; guessing costs whatever the tool was
about to do", and that silence, a cough and a change of subject are "none of them consent".

**What this rules out:** treating an answer that contains both yes and no, or no recognised word at all, as
approval or refusal. The result is `unclear`.

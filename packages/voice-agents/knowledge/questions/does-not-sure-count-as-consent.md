---
type: question
title: Should "not sure" count as consent?
description: interpretConsent grants "not sure" because "sure" is a grant phrase and "not" is not in any list
tags: [voice-agents, approval, consent]
---

# Should "not sure" count as consent?

`interpretConsent` in `packages/voice-agents/src/spoken-approval.ts` treats `sure` as a grant (line 127)
and has no entry for `not` in either `GRANTS` (lines 106-129) or `DENIALS` (lines 131-147). The grant
match uses a word boundary (line 163).

So the transcript "not sure" normalises to "not sure" (line 182), matches `sure` as a grant (lines 185 and
163), finds no denial (line 186), and returns `granted` (line 190). I traced it by reading the code and
ran `interpretConsent` on that string with bun. It returned `granted`.

The same happens for "ok then i think not", which matches `ok`, and for "yes I think so". The doc comment at
lines 175-179 says that anything not plainly yes or no is `unclear`.

Question: should a negated grant phrase, such as "not sure", be read as a denial or as unclear? The code does
not handle negation, and no note in this package says whether it should.

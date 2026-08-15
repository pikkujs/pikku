---
'@pikku/core': patch
---

fix(core): a denied tool call still reads as denied after a reload

The result stored for a denied approval was a bare sentence written for the
model. A client has no way to tell that apart from a tool that succeeded and
returned prose, so it could only show the denial from what it had just done
itself — the optimistic `{ approved: false }` it writes when the deny button is
clicked. The moment the thread re-rendered from storage, that local knowledge
was gone and the denied call came back as a successful one, green badge and all.
In a delegated run, where the parent keeps streaming after the denial, this was
the only state a user ever saw.

The stored and streamed result now carries `approved: false` alongside the same
sentence, so the denial survives the round trip and both readers get what they
need. The action was never actually performed in either case; only the reporting
of it was wrong.

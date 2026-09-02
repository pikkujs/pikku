---
'@pikku/inspector': patch
'@pikku/skills': patch
---

Refuse a scenario step whose prose opens with its own actor (PKU681). The
reporter already renders the actor as the sentence's subject, so a step
authored as `'sam' creates the client` and run as `{ actor: actors.sam }`
reads "Given sam 'sam' creates the client" — and the hardcoded name desyncs
the moment the call site changes actor. Only the subject position is refused:
naming someone else mid-sentence, or an actor keyed after a role noun used as
a noun ("creates the admin client"), is left alone.

---
'@pikku/core': patch
'@pikku/cli': patch
---

A step ladder reads as one paragraph, not as a list of restatements

Every step named its actor by persona key and repeated the phase keyword, so a
three-step run by one person said their name three times and "Given" three
times, and never said who that person was.

A ladder now introduces an actor once and carries them:

```
Given yasser (the founder) signs in
When  yasser opens the dashboard
And   sees the audit log
And   nadia reviews the invite
```

A repeated phase reads as `And`, the way Gherkin has always written it. A step
that continues both the phase and the actor drops the repeated subject, because
English drops a repeated subject in a compound predicate. It takes both: eliding
across a phase change gives "When opens the dashboard", and a pronoun instead of
a name would give "they sees", since step templates are authored in the third
person singular.

The introduction is the persona's `jobTitle` — prose someone wrote for a reader.
`roles` is authorisation, so a persona whose only description is a `reviewer`
grant gets no introduction rather than one assembled out of its grants.

A row carries `sentenceWithRole` alongside `sentence`, set only where an actor
is first named, so a renderer can offer the introduction as a toggle without
parsing a composed sentence back apart.

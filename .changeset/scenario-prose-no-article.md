---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

A step ladder reads as one paragraph, not a list of restatements

Every step prefixed its actor with `the `, named that actor again, and repeated
the phase keyword. A three-step run by one person said their name three times
and `Given` three times, only read as English when the persona key happened to
be a role noun, and never said who that person was — the fabric template's own
placeholder came out as `the nadia opens /app`.

```
Given yasser (the founder) signs in
When  yasser opens the dashboard
And   sees the audit log
And   nadia reviews the invite
```

The article is gone: the actor key is the subject verbatim, so a persona named
after a person reads as that person. A repeated phase reads as `And`, the way
Gherkin has always written it. A step that continues both the phase and the
actor drops the repeated subject, because English drops a repeated subject in a
compound predicate — it takes both, since eliding across a phase change gives
`When opens the dashboard`, and a pronoun rather than a name would give `they
sees`, step templates being authored in the third person singular.

An actor is introduced once, by the persona's `jobTitle` — prose someone wrote
for a reader. `roles` is authorisation, so a persona whose only description is a
`reviewer` grant gets no introduction rather than one assembled out of grants.
A row carries `sentenceWithRole` alongside `sentence`, set only where an actor
is first named, so a renderer can offer the introduction as a toggle without
parsing a composed sentence back apart.

`{placeholder}` filling, the `#ordinal` lookup for repeated step names and an
actorless step reading as its description alone are all unchanged.

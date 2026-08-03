---
'@pikku/console': patch
'@pikku/inspector': patch
'@pikku/core': patch
---

Read the actors that are not people on the personas page.

The platform — the app acting on itself, what `pikkuPlatformScenarioStep`
declares — now has a row of its own, alongside one per addon whose system a
step makes act. They sit behind a People / System / All filter that opens on
the people: a subject holds no roles and signs in as nobody, so leading with it
would put the rows nothing is authorized through above the ones that are.

The platform row is built in rather than derived. A project that has never
written a platform step still has a platform, and a card that appeared the
moment somebody declared their first step would read as a feature they had
switched on.

Also: PKU680 now counts `expectService`, `expectError` and `expectEventually`
as assertions. They are inline steps and carry no phase, so a scenario whose
only witness was a recorded service call was being told it never asserts.

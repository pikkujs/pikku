---
'@pikku/knowledge': patch
---

Add the attempt ledger: `attemptsSpent`, `recordNoteAttempt`, `noteAttempts`,
`noteFingerprint` and the single frontmatter writer `setNoteScalars`. A loop
driving seats over a knowledge base needs a bound on how many turns one seat may
spend on one note, and one that refunds itself when the note is rewritten — this
is that bound, keyed on a fingerprint of the note's content and the scalars a
profile's gates refuse on. `attempts:` is now read as an OKF scalar.

---
'@pikku/core': patch
---

Add the passphrase gate for classified columns: `DataLock`, the `requireUnlocked` middleware, and `wireDataLock` on a new `@pikku/core/data-lock` entry point.

A server with `wrapped` or `sealed` columns can now boot **locked** — it holds no key, serves the app shell and an unlock endpoint, and refuses every classified read or write until the passphrase arrives over HTTP. That keeps unlocking identical for a desktop build and a headless `pikku serve`, and keeps the passphrase out of the environment and the process table.

- `DataLock` derives one KEK per key id from per-record salts, verifies the passphrase by unwrapping a stored verifier (AES-GCM's auth tag does the checking), and throttles guesses — five failures open a lockout window that doubles to a 15-minute cap. A correct passphrase waits out the window too, or the timing difference would confirm the guess.
- `keyIdsFromManifest` derives the key ids to mint from the generated classification manifest, so a key a column names can never go uninitialized. `ColumnClassification` gains an optional `keyId`.
- New errors: `DataLockedError` (423), `InvalidPassphraseError` (403), `TooManyAttemptsError` (429).

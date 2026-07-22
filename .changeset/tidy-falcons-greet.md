---
'@pikku/cli': patch
---

Put the login code in the sign-in link, and open it automatically

`pikku fabric login` printed a bare `/cli-auth` URL plus a separate code for the
user to retype. The console page has always read `?code=` from the URL and
prefilled the field — the CLI just never used it. The code now rides in the
link, so following it is the whole flow. It is still printed for a hand-typed
fallback and so it survives a copied terminal line.

The link also opens in the default browser automatically. It is skipped when
`SSH_TTY` or `CI` is set, where opening a browser on the wrong machine is worse
than not opening one, and `--no-browser` disables it. A launch failure warns and
leaves the printed URL as the fallback rather than failing the login.

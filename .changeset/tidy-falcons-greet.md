---
'@pikku/cli': patch
---

Open the sign-in page automatically, and stop on a cancelled login

`pikku fabric login` printed a `/cli-auth` URL and left the user to find it. The
link now opens in the default browser automatically. It is skipped when
`SSH_TTY` or `CI` is set, where opening a browser on the wrong machine is worse
than not opening one, and `--no-browser` disables it. A launch failure warns and
leaves the printed URL as the fallback rather than failing the login.

The code is not carried in the link. Typing it is what proves the person
authorizing the token is the person who ran the command — a URL that carries its
own code is a one-click grant for anyone who can put it in front of a signed-in
user. The output leads with the code and treats the URL as the destination.

`pollCliAuth` can now return `rejected`, which the CLI reports as a cancelled
sign-in and exits on, instead of polling until the code expires and then
blaming the timeout.

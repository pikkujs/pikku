---
'@pikku/cli': patch
---

serve: keep the project's own `staticMounts`

`pikku serve` built its mount list from the console and frontend mounts alone
and dropped anything the project declared in `staticMounts`, so every mount an
app configured for itself was silently unserved under `serve`. `dev` already
appends them; `serve` never did.

They now sit between the console mount and the frontend mount: the console
stays first so a frontend at `/` cannot claim `/console`, and the app's own
mounts are offered the request before the catch-all frontend.

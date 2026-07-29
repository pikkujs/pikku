---
'@pikku/cli': patch
'@pikku/playwright': patch
---

`pikku scenario run` can now target a URL that only exists at run time.

The environment named on the command line was the whole answer: its `apiUrl` and `appUrl` are literal strings in `pikku.config.json`, frozen when the config was written. A suite that wants to run against something provisioned moments earlier — a freshly deployed sandbox with a unique origin — had nowhere to put that address short of synthesising a config file per run.

`--api-url` and `--app-url` now override the named environment's URLs for one invocation. The environment is still looked up by name and must still exist, so the flags override a target rather than inventing one, and the override is applied once where the environment is resolved: actors, raw-HTTP steps, the browser driver and a `--spawn`ed server all see the same address. A value that is not an absolute http(s) URL is rejected where it was typed, and `--spawn` with a non-local `--api-url` is refused instead of trying to bind a server to a host this machine does not own.

Browser steps get the same reach. A driver that knows the target from its own environment — `@pikku/playwright` reading `SANDBOX_HOSTNAME`, `E2E_APP_URL` or `APP_URL` — is now allowed to supply the `appUrl` when the config names none; previously the runner refused before the driver was ever consulted. The check still fires when nothing resolved a real target: a driver reporting `appUrlSource: 'default'`, as `@pikku/playwright` now does for its `http://localhost:5001` placeholder, fails the run exactly as a missing `appUrl` always did.

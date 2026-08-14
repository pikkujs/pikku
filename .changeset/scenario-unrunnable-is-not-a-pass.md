---
'@pikku/cli': patch
---

fix(scenario): a scenario that cannot run on the requested surface fails the run instead of skipping it

`pikku scenario run` held back two very different things under one SKIP and exited
0 for both. A `skip` on the scenario is the project quarantining it on purpose and
should stay green. A scenario with no binding for the run surface and no `default`
to fall back to is nothing of the sort — it was asked for and could not run, which
is a misconfigured run.

Reporting both as skips made "62 held back" and "62 passed" indistinguishable at
the exit code. That is not hypothetical: the e2e console suite ran `--tags console`
without `--run browser`, so every browser scenario had no runnable binding, and the
job passed for months having executed four scenarios out of sixty-six.

Unrunnable scenarios now name themselves and set a non-zero exit code, pointing at
the two ways to resolve it — run them on the surface they are written for, or hold
them back explicitly with `--exclude-tags`.

`--no-browser` is gone. It was meant to be the blunt form of `--run default` for a
machine without a browser, but the only branch that consulted it required
`--run browser` to have been passed already, so it never fired in any invocation;
`--exclude-tags` says the same thing about what is not being run, and says it
explicitly.

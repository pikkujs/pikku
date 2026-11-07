# Proving

A finding you ran is worth more than one you traced. Run it safely, and run it the way an attacker would.

**Set up first.** Work in a copy with a throwaway database, migrated, and never against a real stage or real data. Set the port and URL yourself, because a project's default can reach another local app. Start the API only, so a dev server does not bind a frontend to the network.

**Set limits.** Use a memory cap and a time limit before running anything an input can size. On macOS there is no `timeout`, and `ulimit -v` is not enforced, so run a watchdog that stops your process by its ID when memory or time runs over. On a shared machine, stop only your own processes.

**Stub what costs money.** For agent apps, point the model at a local stub so you can run real routes without spending. Do the same for payment providers.

**Use the real route for access findings.** A direct `func` call skips auth and permission gates, so it cannot prove who can reach something. Start the copy with `pikku dev`, in its own session if a tool shell kills it when backgrounded, and send the request over HTTP with no session, then with a second user's session. For a signed-in flow, a `pikkuScenario` drives the app as a virtual user over the real transport; see `pikku-scenario`.

**Use a direct call for logic.** It is fine for what happens inside a function, such as the second run or a crash between two writes. Say so in the finding.

**Check your run survived.** Note the server's start time, and compare it with your results. If it restarted, rerun what depended on it.

**A server that will not boot is setup, not a limit.** A diff inherits the app's boot problems. In your copy, create missing tables from the error, stub a broken addon's metadata and switch off what you cannot run, listing each bypass. Report the boot failure as a floor finding, then carry on. Mark an access finding `read` only after those attempts fail, and say which you tried.

**A diff gets the same treatment.** Apply it in your copy and run its access findings over HTTP. If a finding cannot be run, say why rather than dropping to reading alone.

If you could not run something, mark it `read` and say why.

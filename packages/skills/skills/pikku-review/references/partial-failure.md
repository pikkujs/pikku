# Failing halfway

Assume a crash between any two lines. What state is left, and what does the next run do with it?

- Are multiple writes in one `kysely.transaction`? Does the database in use actually support transactions?
- Does an external call happen before its DB stamp, so a crash repeats it?
- Does a throw after a write leave the record stuck?
- Does a delete account for every table pointing at the row, with foreign keys on and off?
- Are failures swallowed by a `try/catch`, or counted as success?
- Does a failure on one item abort the rest of a batch?
- After a stop or cancel returns, is anything still running? Reporting success while work continues is a bug.
- Can a status change skip a state? Is there a guard on the current status?

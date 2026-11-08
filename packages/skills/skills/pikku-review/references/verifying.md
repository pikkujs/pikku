# Verifying

A reviewer told to attack finds things, and some of them are wrong. Test each bug before you report it.

Hand every bug to a separate agent and give it the finding and the code but not your reasoning. Its job is to prove the finding false. Reviewers rarely reject their own work, so a pass you run yourself is weak: if you cannot spawn an agent, say so in the report.

For each bug, ask:

- Was this the intended behaviour? Look for a schema, comment, seed, scenario or sibling that says so.
- Is the guard somewhere else: a constraint, a permission, middleware, a caller?
- Is the claim true of this database, runtime or version?
- Does the scenario really reach this line?
- Does the run prove what the finding claims, or something smaller?
- For a diff: did this change cause it or make it worse, or was it already there?

Keep it as a `bug` only if it survives. Move it to `fix` if it is real but no wrong result follows, and drop it if it is false. List every bug that went in with what you tried against it and the outcome, including those downgraded or dropped. If nothing failed, say what you tried, because a pass that rejects nothing may not have looked.

Then pick the gold verdicts that matter most, such as anything touching money or access, and attack those the same way. A wrong gold costs more than a wrong bug, and this is the only check on it.

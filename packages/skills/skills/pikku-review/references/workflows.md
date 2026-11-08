# Workflows

Read `pikku-workflow` first. It holds the rules; these are the ways they get broken.

- Should this be a workflow? Anything a trigger starts is, even with one step. So is anything crossing a boundary that must not be lost.
- Is it wrongly a workflow? An on-screen request and response is a plain function.
- Does a scheduler do more than start a workflow?
- Is there a `try/catch` around steps, where `compensate` belongs?
- Does a gate have real `approvers`, or the default `any`?
- Does an approval resume on any answer, or only a valid one?
- Are all-or-nothing writes split across steps? A step is a unit of retry, not atomicity.
- Is a run with no recorded owner readable by anyone?
- Do retries and reminders stop too early, or only ever fire once?
- Is every side effect inside a step? A workflow body replays, so a write, email or audit entry outside a step happens again on each replay.

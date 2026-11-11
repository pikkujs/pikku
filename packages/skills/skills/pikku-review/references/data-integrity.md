# Data integrity

These bugs leave the database saying something untrue, and nothing throws at the time.

- What must be unique, and does the database enforce it? Is a value unique only within a parent but joined as if it were global?
- Is one fact written by two paths with different guards? Pick one writer.
- Does a partial update wipe the fields the caller left out?
- Does a lookup filter by everything it means: kind, status, owner? An unfiltered query can return the wrong row and look right, or count a cancelled record as live.
- Does every real order of events have a legal path through the state machine? A missing edge can throw after the money has moved.
- Does a raw `OR` in a query sit inside brackets? Without them it escapes the filters around it, including the owner check.
- Is a past record read from today's value? An order line must show the price paid, not the current price. Read what the column means.
- Does a join multiply rows before a sum? One order with three lines can count its total three times.
- Is a state check an allowlist? `status != 'cancelled'` lets through every state nobody thought of, including unpaid ones.
- When code rebuilds an object field by field, as in a mapper, copy or snapshot, which fields does it drop?
- List every event that should be refused in each state, then check the guard refuses each one, not just the first that came to mind.
- Does the code keep the rule a migration, constraint or comment states? Read those as the spec.
- Does a total or count run on the same filters as the page it describes?
- Is each expiry or clean-up sweep keyed on the column that means the thing, such as last activity rather than creation?

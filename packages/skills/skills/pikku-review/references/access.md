# Access

Who can reach this, and what can they do with it? Most serious findings live here, and the tools see almost none of them.

- Follow the real route, not the function. Scaffold routes can be `auth: false`.
- Can an anonymous caller reach it, directly or through `/workflow/*`, an agent route or an addon stream?
- For `auth: false`, what is the actual guard? Trace it to a conclusion. An environment gate is only as safe as the places that set the variable.
- Is every id scoped to the session's user or tenant? Pass another user's id.
- Is identity proven? Can an unverified email match a record, or a user declare their own role?
- Is a "run now" or admin action limited to the caller's own data?
- What happens when a variable is unset? Production should fail closed: no fallback secret, no localhost in a customer link, no CORS that reflects any origin with credentials.
- Is the same access check copied into several functions instead of being one `pikkuPermission`?
- Do outputs, run streams, logs or errors carry PII to someone who should not see it?
- Is a user's choice, such as consent, opt-out or visibility, enforced where the data is used, or only stored and passed along?

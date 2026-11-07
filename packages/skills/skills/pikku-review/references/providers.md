# Providers

Payment and other external services fail in the gaps between your code and theirs.

- Is the provider's webhook the source of truth? Someone can pay and close the tab, so a page must not be what finishes the job.
- Does anything depend on a page polling?
- Does every intermediate status have a way out, or can a record stay stuck?
- Is the webhook's signature checked, and does a repeat delivery do nothing?
- Does a call that costs money check a budget first? The same call-before-stamp risk as a sent email applies: see [partial failure](partial-failure.md).
- Does the amount received match the amount owed? What happens to the money if it does not?
- Is the idempotency key stable across retries? A key built from a timestamp or random id changes each time, so a retry charges twice.
- Does a streamed body assume one chunk is one line or one event? Chunks split anywhere, so buffer to the real boundary.

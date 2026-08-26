---
'@pikku/inspector': patch
---

Extend the classification sink scan to personal data, as PKU954.

PKU953 already followed a revealed vault secret into a logger, a queue, an
email, an audit or a webhook. A PII column reaches those same sinks with no
`.reveal()` to mark the moment — `Pii<T>` is simply the brand the generated row
types carry — and nothing flagged it.

It is not the same rule, because PII is not a secret: the question is not
whether the value is written down, but whether writing it there hands it to
somebody else. A log is shipped to a third-party aggregator and retained long
past any consent, and a webhook posts to another server, so both are reported.
An email is addressed to the data subject, an audit is a row in the operator's
own database, and a queue payload is consumed by the operator's own worker, so
none of those are. `private` is never reported at all — it says who may read
the row, not that recording it is a disclosure.

The scan is still opt-in behind `pikku all --security` and still reports at
`error` severity, so the dev server keeps starting and `--fail-on-error` is
what blocks a build.

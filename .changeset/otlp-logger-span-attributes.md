---
'@pikku/core': patch
---

A log record that `OtlpLogger` exports from inside a function's span now carries `pikku.function.id`, `pikku.function.version`, `pikku.wire.type`, `pikku.wire.id` and, when the span has them, `pikku.user.id` and `pikku.org.id`, so a read side can group and filter logs by function and wire like spans. Function spans gain `pikku.function.version` for a versioned function (`name@v2`). Nothing else of the span is copied and `PIKKU_OTLP_LOG_FIELDS` is unchanged.

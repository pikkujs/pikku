---
'@pikku/core': patch
---

`OtlpLogger` now stamps each log record with the time it was logged. Previously the timestamp was filled in when the batch was encoded, so every record in one export carried the export time.

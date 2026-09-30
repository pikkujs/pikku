---
'@pikku/core': patch
---

The workflow status stream sends a `suspended` frame with the run's reason when a run suspends, and stays open for the resume. It used to send nothing to say that no more progress was coming without action.

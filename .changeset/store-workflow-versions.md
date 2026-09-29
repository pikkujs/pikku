---
'@pikku/core': patch
---

Store a workflow's graph when a run is created, so a run suspended across a
deploy that changes the definition resumes on the graph it started on instead
of failing with `VERSION_NOT_FOUND`. Nothing called `registerWorkflowVersions`,
so the versions table stayed empty and the replay fallback could never find a
version.

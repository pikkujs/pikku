---
'@pikku/deploy-standalone': patch
---

deploy-standalone: start the scheduler and trigger service the project actually uses

The generated entry constructed an `InMemorySchedulerService` and an
`InMemoryTriggerService`, passed them to `createSingletonServices` as
defaults, and then started its own local variables rather than what came
back. A project whose factory returns its own — a broker-backed scheduler,
say — got the in-memory one started as an orphan nothing references, while
the real one never started at all, so no scheduled task ran unless a
`pikkuServerLifecycle` hook started it by hand.

Doing that then made it worse: both tick over one task registry, so every
cron fires twice. In fabric that put two consumers on the workflow
orchestrator queue and a deploy workflow lost a step, reporting `planning`
for thirty minutes with a live build host.

The entry now starts `singletonServices.schedulerService` and
`singletonServices.triggerService`, so there is one start and it is the
instance the app holds. Projects that let the defaults through are
unaffected.

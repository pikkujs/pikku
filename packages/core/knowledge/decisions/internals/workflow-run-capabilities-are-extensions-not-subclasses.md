---
type: decision
title: Workflow run capabilities are extensions, not subclasses
description: Scenario support lives in a separate module behind `setRunExtension` because a bundler drops an unused module but never an unused class member
tags: workflow
---

# Workflow run capabilities are extensions, not subclasses

`PikkuWorkflowService` names nothing about what a `WorkflowRunExtension` is for.
An extension is installed with `setRunExtension(create)` and receives a narrow
`WorkflowRunEngine` handle — `inlineStep`, `updateRunStatus`,
`onChildWorkflowFailed`, `verifyStepName` — so recording a durable step stays
available to it without becoming public API on every workflow service a
production app instantiates.

The reason it is not a subclass is bundle size: a bundler drops an unused
_module_ but never an unused class member. Anything declared on
`PikkuWorkflowService` ships in every server built on Pikku, along with
everything it imports. `PikkuScenarioService` (`pikku-scenario-service.ts`) is
the one implementation today — steps, actors, lifecycle hooks, the browser
provider and the assertion wire members — and scenarios only ever run from
`pikku scenario run`, so the whole surface stays behind an import that only the
runner makes. It is not a workflow service in its own right because a scenario
is not a different kind of run; it is the same durable run with a step
vocabulary on top. `scenario-service.test.ts` asserts that none of those members
leak onto the base class.

`createScenarioRunner` in the same file bundles the two lines
`pikku scenario run` needs so no caller has to remember the capability is
installed rather than inherited. It pairs the extension with
`InMemoryWorkflowService`, which is the right engine because a scenario run is a
single external process driving a deployed app over its real transport: there
is nothing to persist and no second worker to resume it.

**What this rules out:** moving scenario steps, actors, hooks or the browser
provider onto `PikkuWorkflowService`, making `PikkuScenarioService` extend it,
or widening `WorkflowRunEngine` into "just pass the service" — each one puts the
scenario runtime, and its transitive imports, into every deployed Pikku server.

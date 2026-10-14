---
type: decision
title: The Azure handler factories pass every HTTP request to fetchData and run queue and timer work with no session
description: createAzureHandler converts the request and calls core's fetchData with nothing added, builds queue jobs from the message alone, and runs every scheduled task on each timer tick
tags: azure, auth, http, queue, scheduler
---

# The Azure handler factories pass every HTTP request to fetchData and run queue and timer work with no session

`createAzureHandler` in `packages/runtimes/azure-functions/src/handler-factories.ts` returns an `http`, a
`queue` and a `timer` handler, depending on the handler types requested (lines 68-72, 74, 113, 163).

**HTTP.** The handler converts the Azure request into a standard `Request` (lines 81-90) and calls
`fetchData(webRequest, response)` (line 94). It adds no authentication and no middleware. An error from
`fetchData` is only written to `console.error` (lines 95-97), and the handler then returns whatever the
response object holds (lines 99-109). The registration side sets `authLevel: 'anonymous'`, see
[Azure HTTP functions are registered with anonymous auth](../../../../deploy/deploy-azure/knowledge/decisions/azure-http-functions-are-anonymous-and-the-runner-authenticates.md).

**Queue.** The job is built from the queue message (lines 120-157): a string that is not JSON becomes
`{ body }` (lines 121-126), and `data` is `data.data ?? data` (line 138). `runQueueJob({ job })` is called with
no session (line 159). `waitForCompletion` throws for Storage Queues (lines 152-156).

**Timer.** Every tick runs every scheduled task the process knows (lines 169-173), with a `traceId` of
`cron-<uuid>`. The timer argument is ignored (lines 164-167), so the handler does not choose a task by which
trigger fired.

**Services.** They are built once and cached for the function app instance (lines 39-44, 55-60). The secrets
service is a `LocalSecretService` over the process environment (lines 45-49).

**What this rules out:** relying on this layer to refuse an unauthenticated HTTP call, and mapping one timer
trigger to one scheduled task.

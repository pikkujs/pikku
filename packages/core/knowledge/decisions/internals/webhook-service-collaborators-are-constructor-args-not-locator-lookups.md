---
type: decision
title: Webhook service collaborators are constructor args, not locator lookups
description: QueueWebhookService takes its queue as a constructor parameter so a project wiring webhooks without a queue fails to compile instead of at first send
tags: services
---

# Webhook service collaborators are constructor args, not locator lookups

`QueueWebhookService` (`packages/core/src/services/queue-webhook-service.ts`)
takes `queueService` as a constructor parameter, even though it reaches for
`config` and `secrets` through `getSingletonServices()` inside its methods. The
queue is different on purpose: it is the collaborator without which the class
cannot do anything at all.

A `getSingletonServices()` lookup turns a wiring mistake into a runtime failure
on the first `send()` — typically in production, typically on the first webhook a
customer was waiting for. A constructor parameter turns the same mistake into a
type error at the point where the service is wired.

**What this rules out:** "simplifying" the constructor away so the class looks
like its neighbours and pulls the queue from the service locator like everything
else. The inconsistency inside this class is the decision, not an oversight; if
anything the pressure should run the other way, toward making `config` and
`secrets` constructor args too.

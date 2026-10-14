---
type: overview
title: Decisions
description: Rules chosen in the serverless deploy target, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [Serverless deploys reference app secrets as SSM parameter paths, never as inline values](serverless-app-secrets-are-ssm-references.md) — serverless.yml reads each secret from an SSM parameter named by project and stage, so no secret value is written into the file
<!-- /pikku:knowledge-index -->

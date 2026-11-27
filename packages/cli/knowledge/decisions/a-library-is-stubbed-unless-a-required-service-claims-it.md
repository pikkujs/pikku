---
type: decision
title: A heavy library is stubbed unless a required service claims it
description: Every SERVICE_MODULE_MAP pattern is stubbed out of a unit unless a service the unit requires claims it, including for a service the project never lists
tags: [deploy, bundler, services]
---

# A heavy library is stubbed unless a required service claims it

A host's platform services module is one file that every unit imports, so it can
import a library such as `@cloudflare/puppeteer` for an app that has no
`browser` service at all. `getDeadGenFilePatterns` therefore stubs each
`SERVICE_MODULE_MAP` pattern that no required service claims, whether the
project lists that service or not.

Generated files in `SERVICE_GEN_FILE_MAP` are stubbed only for a service that is
listed and not required.

**What this means:** a library in the map reaches a unit only through the service
names mapped to it. Code that uses it under another service name gets the stub.

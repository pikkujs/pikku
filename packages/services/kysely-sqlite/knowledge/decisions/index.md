---
type: overview
title: Decisions
description: How the libsql web dialect chooses its auth token
---

# Decisions

<!-- pikku:knowledge-index -->
- [An explicit libsql auth token wins over a token in the database URL](an-explicit-libsql-auth-token-wins-over-the-url-token.md) — The libsql web dialect reads ?authToken= from the URL but uses config.authToken when both are set, and it talks to the HTTP pipeline with fetch rather than the Node client
<!-- /pikku:knowledge-index -->

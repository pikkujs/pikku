---
type: overview
title: Questions
description: Things asked of openapi-parser and not yet answered
---

# Questions

Something asked and not yet answered. The choice stays, the doubt gets recorded.

<!-- pikku:knowledge-index -->
- [Should a delegated login invent an email when the upstream returns none?](should-a-delegated-login-invent-an-email.md) — With no upstream email, the default emailTemplate builds one from the login and host, and that value reaches generated code
- [Which security scheme sets the auth type when several are declared?](which-security-scheme-sets-the-auth-type-when-several-are-declared.md) — detectAuthType returns the kind of the first scheme in declaration order that matches any known kind, not the first oauth2 scheme, so an earlier apiKey or bearer scheme takes precedence
<!-- /pikku:knowledge-index -->

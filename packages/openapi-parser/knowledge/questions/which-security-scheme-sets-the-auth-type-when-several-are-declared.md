---
type: question
title: Which security scheme sets the auth type when several are declared?
description: detectAuthType returns the kind of the first scheme in declaration order that matches any known kind, not the first oauth2 scheme, so an earlier apiKey or bearer scheme takes precedence
tags: [openapi, auth, security-schemes]
---

# Which security scheme sets the auth type when several are declared?

`detectAuthType` in `packages/openapi-parser/src/parse-openapi.ts:288-305` reads the
schemes from `components.securitySchemes`, or from `securityDefinitions` for v2
documents (`parse-openapi.ts:289-290`).

It loops over the schemes in the order the object gives them (`parse-openapi.ts:292`).
For each scheme it checks four kinds in turn, and returns the first that matches:
`oauth2` (`:293`), `bearer` (`:294-295`), `apiKey` (`:296`), and `basic` (`:297-301`).
If no scheme matches, it returns `'none'` (`:304`).

So the first scheme in declaration order that is any known kind decides the answer.
The loop does not look for an `oauth2` scheme first. A document that declares an
`apiKey` scheme before an `oauth2` one gets `apiKey`.

The file has no comment on this order. Open: is the first declared scheme meant to
decide the auth type, or should a supported kind such as `oauth2` take priority over
an earlier one? The code does not say which was intended.

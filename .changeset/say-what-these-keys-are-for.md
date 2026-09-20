---
'@pikku/core': patch
---

Document five public keys that carried no JSDoc: `wireChannel`'s `onDisconnect`,
`wireRemoteAddon`'s `serverUrl` and `tags`, and `CoreUserSession`'s `userId` and
`orgId`. A key printed as a name and a type is a shape; what a caller needs is
what to put in it, and only the JSDoc where the type is declared carries that
into the IDE, the console and the shipped surface doc at once.

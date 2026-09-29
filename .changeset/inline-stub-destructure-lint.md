---
'@pikku/inspector': patch
---

Stop the services-destructure lint (PKU410) firing on the stub a wiring registers for its function. Since inline functions carry a source file, a queue worker wired to a named function failed the build with a critical PKU410 even though that function destructures its services.

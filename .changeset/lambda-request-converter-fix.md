---
'@pikku/lambda': patch
---

Fix request converter to avoid undefined httpMethod

Store httpMethod in a variable before using it to prevent potential undefined access issues in request body handling.

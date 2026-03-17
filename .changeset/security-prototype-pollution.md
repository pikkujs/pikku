---
"@pikku/core": patch
---

Filter out __proto__, constructor, and prototype keys during request data merging to prevent prototype pollution.

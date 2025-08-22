---
'@pikku/core': patch
---

feat: implement ordered middleware and permission execution system

## New Features

### Ordered Execution System
Both middleware and permissions now execute in a specific hierarchical order:
1. **Wiring Tags** - Tag-based middleware/permissions from wiring level (e.g., HTTP route tags)
2. **Wiring Middleware/Permissions** - Direct wiring-level middleware/permissions  
3. **Function Middleware** - Function-level middleware
4. **Function Tags** - Tag-based middleware/permissions from function level

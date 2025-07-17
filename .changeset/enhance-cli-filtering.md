---
'@pikku/inspector': patch
'@pikku/cli': patch
---

feat: enhance CLI filtering with type and directory filters

- Add --types filter to filter by PikkuEventTypes (http, channel, queue, scheduler, rpc, mcp)
- Add --directories filter to filter by file paths/directories
- All filters (tags, types, directories) now work together with AND logic
- Add comprehensive logging interface to inspector package
- Add comprehensive test suite for matchesFilters function
- Support cross-platform path handling

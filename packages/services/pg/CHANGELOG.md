## 0.11.0

## 0.11.1

### Patch Changes

- bb223d5: fix: using a reserved connection for locks
- Updated dependencies [bb223d5]
  - @pikku/core@0.11.1

### Minor Changes

- Initial release with PostgreSQL-backed channel, eventhub, and workflow stores

# @pikku-workflows/pg

## 0.10.0

### Major Changes

- Initial release of @pikku-workflows/pg
- PostgreSQL-based PikkuWorkflowService implementation
- Auto-initialization of schema and tables
- Row-level locking with PostgreSQL advisory locks
- Configurable schema names

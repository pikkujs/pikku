## 0.11.0

## 0.11.2

### Patch Changes

- db9c7bf: Add workflow graph support to PgWorkflowService
- Updated dependencies [db9c7bf]
  - @pikku/core@0.11.2

## 0.11.2

### Features

- f35e89da: Add workflow graph support to PgWorkflowService
  - Add `inline` and `state` columns to workflow_runs table
  - Add `branch_taken` column to workflow_step table
  - Add `setBranchTaken` method for graph branching

## 0.11.1

### Patch Changes

- 4b811db: chore: updating all dependencies
- ce902b1: fix: using a reserved connection for locks
- Updated dependencies [4b811db]
- Updated dependencies [e12a00c]
- Updated dependencies [4579434]
- Updated dependencies [28aeb7f]
- Updated dependencies [ce902b1]
- Updated dependencies [06e1a31]
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

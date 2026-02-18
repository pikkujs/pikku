Feature: Workflow deployment safety with shared queues

  Background:
    Given infrastructure is reachable
    And a clean isolated test namespace is created

  Scenario: In-flight run started on v1 is safely continued by v2 worker
    Given stack is running:
      | name     | profile            | role   |
      | api      | server-a-v1        | api    |
      | workerV1 | server-c-worker-v1 | worker |
    When I start workflow "taskCrudWorkflow" via "api" with fixture "taskCrudWorkflow"
    And run "current" is queued but not completed
    And I replace process "workerV1" with profile "server-c-worker-v2" as "workerV2"
    Then run "current" status eventually becomes "completed"
    And run "current" output matches fixture "taskCrudWorkflow.completed"
    And run "current" has no duplicate successful step executions

  Scenario: Mixed v1 and v2 workers do not double-execute workflow steps
    Given stack is running:
      | name     | profile            | role   |
      | api      | server-a-v1        | api    |
      | workerV1 | server-c-worker-v1 | worker |
      | workerV2 | server-c-worker-v2 | worker |
    When I start workflow "taskCrudWorkflow" via "api" with fixture "taskCrudWorkflow"
    Then run "current" status eventually becomes one of:
      | completed |
      | failed    |
    And run "current" has no duplicate successful step executions
    And worker execution trace for run "current" is captured

  Scenario: Version mismatch fails predictably when stored version is unavailable
    Given stack is running:
      | name     | profile            | role   |
      | api      | server-a-v1        | api    |
      | workerV1 | server-c-worker-v1 | worker |
    When I start workflow "graphOnboarding" via "api" with fixture "graphOnboarding"
    And run "current" is queued but not completed
    And persisted workflow version for run "current" is removed
    And I replace process "workerV1" with profile "server-c-worker-v2" as "workerV2"
    Then run "current" status eventually becomes "failed"
    And run "current" error code equals one of:
      | VERSION_NOT_FOUND |
      | VERSION_CONFLICT  |

  Scenario: Deployment-aware queue routing keeps old runs on compatible workers
    Given stack is running:
      | name     | profile            | role   |
      | api      | server-a-v1        | api    |
      | workerV1 | server-c-worker-v1 | worker |
      | workerV2 | server-c-worker-v2 | worker |
    And deployment-aware queue routing is enabled
    When I start workflow "taskCrudWorkflow" via "api" with fixture "taskCrudWorkflow"
    Then run "current" status eventually becomes "completed"
    And all successful steps for run "current" were executed by compatible workers

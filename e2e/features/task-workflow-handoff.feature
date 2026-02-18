Feature: Task workflow handoff across isolated processes

  Scenario: Manager starts a task workflow and worker completes it
    Given stack is running:
      | name   | role   | port |
      | api    | api    | 4210 |
      | worker | worker |      |
    When I start workflow "taskCrudWorkflow" via "api" with fixture "taskCrudWorkflow"
    Then run "current" status eventually becomes "completed"
    And run "current" successful steps equal:
      | Create task      |
      | Mark in progress |
      | Mark completed   |
    And run "current" has no duplicate successful step executions
    And run "current" output matches fixture "taskCrudWorkflow.completed"

  Scenario: Suspended run resumes successfully after worker replacement
    Given stack is running:
      | name   | role   | port | profile            |
      | api    | api    | 4210 | server-a-v1        |
      | worker | worker |      | server-c-worker-v1 |
    When I start workflow "taskCrudWorkflow" via "api" with fixture "taskCrudWorkflow.requiresApproval"
    And run "current" status eventually becomes "suspended"
    And I replace process "worker" with profile "server-c-worker-v2"
    And I resume workflow run "current" via "api"
    Then run "current" status eventually becomes "completed"
    And run "current" successful steps equal:
      | Create task      |
      | Mark in progress |
      | Mark completed   |
    And run "current" has no duplicate successful step executions
    And run "current" output field "processorVersion" equals "v1"

  Scenario: Suspended run remains suspended until explicitly resumed
    Given stack is running:
      | name   | role   | port | profile            |
      | api    | api    | 4210 | server-a-v1        |
      | worker | worker |      | server-c-worker-v1 |
    When I start workflow "taskCrudWorkflow" via "api" with fixture "taskCrudWorkflow.requiresApproval"
    And run "current" status eventually becomes "suspended"
    And I replace process "worker" with profile "server-c-worker-v2"
    Then run "current" status stays "suspended" for 5 seconds
    When I resume workflow run "current" via "api"
    Then run "current" status eventually becomes "completed"
    And run "current" successful steps equal:
      | Create task      |
      | Mark in progress |
      | Mark completed   |
    And run "current" has no duplicate successful step executions

  Scenario: Resuming an already completed run is a no-op
    Given stack is running:
      | name   | role   | port | profile            |
      | api    | api    | 4210 | server-a-v1        |
      | worker | worker |      | server-c-worker-v1 |
    When I start workflow "taskCrudWorkflow" via "api" with fixture "taskCrudWorkflow"
    Then run "current" status eventually becomes "completed"
    And run "current" successful steps equal:
      | Create task      |
      | Mark in progress |
      | Mark completed   |
    And run "current" has no duplicate successful step executions
    When I resume workflow run "current" via "api"
    Then run "current" status stays "completed" for 5 seconds

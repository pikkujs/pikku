Feature: Workflow version handoff across separate server processes
  To validate real deployment behavior
  We run isolated server processes with different deployment profiles
  And assert workflow/version behavior without direct runtime metadata mutation

  Background:
    Given infrastructure is reachable
    And a clean isolated test namespace is created

  @multi-process @workflow @versioning
  Scenario: In-flight run started on v1 is continued by v2 worker
    Given stack is running:
      | name   | profile            | role   |
      | api    | server-a-v1        | api    |
      | worker | server-c-worker-v1 | worker |
    When I start workflow "taskCrudWorkflow" via "api" with fixture "taskCrudWorkflow"
    And run "current" is queued but not completed
    And I replace process "worker" with profile "server-c-worker-v2"
    Then run "current" status eventually becomes "completed"
    And run "current" output matches fixture "taskCrudWorkflow.completed"

  @multi-process @workflow @versioning
  Scenario: Version mismatch without stored graph fails with VERSION_NOT_FOUND
    Given stack is running:
      | name   | profile            | role   |
      | api    | server-b-v2        | api    |
      | worker | server-c-worker-v2 | worker |
    When I start workflow "graphOnboarding" via "api" with fixture "graphOnboarding"
    And I remove persisted workflow version for run "current"
    And I restart process "worker"
    Then run "current" status eventually becomes "failed"
    And run "current" error code equals "VERSION_NOT_FOUND"

  @multi-process @rpc @versioning
  Scenario Outline: Latest alias resolves to deployment-specific function versions
    Given stack is running:
      | name | profile   | role |
      | api  | <profile> | api  |
    When I invoke RPC "<rpcAlias>" via "api" with fixture "<inputFixture>"
    Then RPC response field "version" equals "<expectedVersion>"
    And RPC response field "result" equals "<expectedResult>"

    Examples:
      | profile     | rpcAlias    | inputFixture   | expectedVersion | expectedResult |
      | server-a-v1 | processItem | processItem.v1 | 1               | processed-v1   |
      | server-b-v2 | processItem | processItem.v2 | 2               | processed-v2   |

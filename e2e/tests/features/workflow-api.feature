@workflow
Feature: Workflow API

  Background:
    Given the API is available

  # DSL Sequential Workflow
  Scenario: DSL sequential workflow completes with correct output
    When I run the "dslSequentialWorkflow" workflow with:
      | value | name |
      | 5     | Test |
    Then the workflow should complete successfully
    And the workflow output "doubled" should be 10
    And the workflow output "message" should be "Hello, Test!"
    And the workflow output "notified" should be true

  # DSL Parallel Workflow
  Scenario: DSL parallel workflow processes all items
    When I run the "dslParallelWorkflow" workflow with:
      """
      { "values": [1, 2, 3, 4, 5] }
      """
    Then the workflow should complete successfully
    And the workflow output "total" should be 30

  # DSL Branching Workflow
  Scenario: DSL branching workflow takes premium path
    When I run the "dslBranchingWorkflow" workflow with:
      | score | name    |
      | 85    | Premium |
    Then the workflow should complete successfully
    And the workflow output "path" should be "premium"
    And the workflow output "message" should be "Congratulations, Premium!"

  Scenario: DSL branching workflow takes standard path
    When I run the "dslBranchingWorkflow" workflow with:
      | score | name     |
      | 50    | Standard |
    Then the workflow should complete successfully
    And the workflow output "path" should be "standard"
    And the workflow output "message" should be "Thank you, Standard!"

  # DSL Retry Workflows
  Scenario: DSL retry happy workflow succeeds on retry
    When I run the "dslRetryHappyWorkflow" workflow with:
      | value |
      | 7     |
    Then the workflow should complete successfully
    And the workflow output "result" should be 21

  Scenario: DSL retry unhappy workflow fails after retries exhausted
    When I run the "dslRetryUnhappyWorkflow" workflow with:
      | value |
      | 7     |
    Then the workflow should fail

  # DSL Cancellation Workflow
  Scenario: DSL cancellation workflow cancels when requested
    When I run the "dslCancellationWorkflow" workflow with:
      | shouldCancel | value |
      | true         | 5     |
    Then the workflow should be cancelled

  Scenario: DSL cancellation workflow completes when not cancelled
    When I run the "dslCancellationWorkflow" workflow with:
      | shouldCancel | value |
      | false        | 5     |
    Then the workflow should complete successfully
    And the workflow output "result" should be 10

  # Complex Workflows
  Scenario: Complex inline workflow processes items with inline steps
    When I run the "complexInlineWorkflow" workflow with:
      """
      { "items": [2, 3, 6, 8] }
      """
    Then the workflow should complete successfully
    And the workflow output "count" should be 2

  Scenario: Complex error handling workflow recovers from failure
    When I run the "complexErrorHandlingWorkflow" workflow with:
      | value |
      | 5     |
    Then the workflow should complete successfully
    And the workflow output "result" should be 10
    And the workflow output "recovered" should be true

  # Graph Workflows
  Scenario: Graph linear workflow completes all nodes
    When I run the "graphLinearWorkflow" workflow with:
      | value | name      |
      | 5     | GraphTest |
    Then the workflow should complete successfully

  Scenario: Graph branching workflow takes pass path
    When I run the "graphBranchingWorkflow" workflow with:
      | score | name    |
      | 85    | Passing |
    Then the workflow should complete successfully

  Scenario: Graph branching workflow takes fail path
    When I run the "graphBranchingWorkflow" workflow with:
      | score | name    |
      | 50    | Failing |
    Then the workflow should complete successfully

  Scenario: Graph parallel workflow runs nodes in parallel
    When I run the "graphParallelWorkflow" workflow with:
      | value | name     |
      | 5     | Parallel |
    Then the workflow should complete successfully

  # Async Start + Status Polling
  Scenario: Async workflow start and status polling
    When I start the "dslSequentialWorkflow" workflow with:
      | value | name  |
      | 5     | Async |
    Then I should receive a run ID
    When I poll until the workflow completes
    Then the workflow status should be "completed"

  # SSE Status Stream
  Scenario: Workflow status stream delivers events until completion
    When I start the "dslSequentialWorkflow" workflow with:
      | value | name   |
      | 5     | Stream |
    Then I should receive a run ID
    When I stream the workflow status for "dslSequentialWorkflow"
    Then the stream should have received at least 1 event
    And the last stream event status should be "completed"

@workflow-ui @console
Feature: Workflow Console UI

  Background:
    Given the API is available

  Scenario: Completed workflow shows green nodes in console
    When I run the "dslSequentialWorkflow" workflow with:
      | value | name      |
      | 5     | UIGreenTest |
    Then the workflow should complete successfully
    When I open the workflow "dslSequentialWorkflow" in the console
    Then the run status should show "Completed"
    And the node "Double value" should have status "Succeeded"
    And the node "Format message" should have status "Succeeded"
    And the node "Send notification" should have status "Succeeded"
    And the canvas node "doubleValue" should be "green"
    And the canvas node "formatMessage" should be "green"
    And the canvas node "sendNotification" should be "green"

  Scenario: Failed workflow shows red nodes in console
    When I run the "dslRetryUnhappyWorkflow" workflow with:
      | value |
      | 7     |
    Then the workflow should fail
    When I open the workflow "dslRetryUnhappyWorkflow" in the console
    Then the run status should show "Failed"
    And the node "Always fails" should have status "Failed"
    And the canvas node "alwaysFails" should be "red"

  Scenario: Cancelled workflow shows cancelled status in console
    When I run the "dslCancellationWorkflow" workflow with:
      | shouldCancel | value |
      | true         | 5     |
    Then the workflow should be cancelled
    When I open the workflow "dslCancellationWorkflow" in the console
    Then the run status should show "Cancelled"

@workflow
Feature: Workflow Console RPC

  Background:
    Given the API is available

  Scenario: Console lists workflow runs after execution
    When I run the "dslSequentialWorkflow" workflow with:
      | value | name    |
      | 5     | Console |
    Then the workflow should complete successfully
    When I query console RPC "console:getWorkflowRuns"
    Then the console response should contain runs

  Scenario: Console gets workflow run details
    When I run the "dslSequentialWorkflow" workflow with:
      | value | name   |
      | 5     | Detail |
    Then the workflow should complete successfully
    When I query console RPC "console:getWorkflowRun" with the last run ID
    Then the console response should contain run details

  Scenario: Console gets workflow run steps
    When I run the "dslSequentialWorkflow" workflow with:
      | value | name  |
      | 5     | Steps |
    Then the workflow should complete successfully
    When I query console RPC "console:getWorkflowRunSteps" with the last run ID
    Then the console response should contain steps

  Scenario: Console gets workflow run history
    When I run the "dslRetryHappyWorkflow" workflow with:
      | value |
      | 7     |
    Then the workflow should complete successfully
    When I query console RPC "console:getWorkflowRunHistory" with the last run ID
    Then the console response should contain history entries

  Scenario: Console gets distinct workflow names
    When I run the "dslSequentialWorkflow" workflow with:
      | value | name  |
      | 5     | Names |
    Then the workflow should complete successfully
    When I query console RPC "console:getWorkflowRunNames"
    Then the console response should contain workflow names

  Scenario: Console deletes a workflow run
    When I run the "dslSequentialWorkflow" workflow with:
      | value | name   |
      | 5     | Delete |
    Then the workflow should complete successfully
    When I query console RPC "console:deleteWorkflowRun" with the last run ID
    Then the console delete response should be successful

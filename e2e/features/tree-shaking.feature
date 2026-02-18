Feature: Tree-shaking across deployment profiles

  Background:
    Given infrastructure is reachable
    And a clean isolated test namespace is created

  Scenario: API-only profile excludes workflow and queue services
    Given stack is running:
      | name | profile         | role |
      | api  | profile-api-only| api  |
    When I call HTTP route "/health"
    Then the response status is 200
    And required singleton services equal:
      | logger    |
      | variables |
      | secrets   |
      | schema    |
    And singleton services do not include:
      | workflowService |
      | queueService    |
      | schedulerService|
    And no queue workers are registered

  Scenario: Workflow profile includes workflow and queue services
    Given stack is running:
      | name   | profile            | role   |
      | api    | profile-workflow   | api    |
      | worker | profile-workflow   | worker |
    When I start workflow "taskCrudWorkflow" via "api" with fixture "taskCrudWorkflow"
    Then run "current" status eventually becomes "completed"
    And required singleton services include:
      | workflowService |
      | queueService    |
      | schedulerService|
    And queue worker map includes:
      | workflow-queue |

  Scenario: Profile missing required workflow service fails fast
    Given stack is running:
      | name | profile                    | role |
      | api  | profile-workflow-misconfig | api  |
    When I start workflow "taskCrudWorkflow" via "api" with fixture "taskCrudWorkflow"
    Then the request fails with code "SERVICE_NOT_AVAILABLE"
    And the error message contains "workflowService"

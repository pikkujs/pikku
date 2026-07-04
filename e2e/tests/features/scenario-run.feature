@ai @scenario
Feature: Scenario runs
  Scenarios drive real signed-in actors against the running API via
  `pikku scenario run`. Each step executes as its actor, so the actor auth
  plugin and the shared SCENARIO_ACTOR_SECRET must be wired end to end.

  Scenario: orderSupportScenario passes with signed-in actors
    When I run the "orderSupportScenario" scenario against the "local" environment
    Then the scenario run reports all flows passed

  Scenario: a failing scenario surfaces a non-zero exit code
    When I run the "failingScenario" scenario against the "local" environment
    Then the scenario run exits non-zero

  Scenario: scenario run attributes coverage per scenario
    When I run the "orderSupportScenario" scenario with coverage against the "local" environment
    Then the scenario run reports all flows passed
    And the scenario run reports coverage for "orderSupportScenario"

  Scenario: scenario asserts stubbed service calls and per-actor fault injection
    When I run the "notificationScenario" scenario against the "local" environment
    Then the scenario run reports all flows passed

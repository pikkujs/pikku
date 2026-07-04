@ai @userflow
Feature: User flow runs
  User flows drive real signed-in actors against the running API via
  `pikku userflow run`. Each step executes as its actor, so the actor auth
  plugin and the shared USER_FLOW_ACTOR_SECRET must be wired end to end.

  Scenario: orderSupportUserFlow passes with signed-in actors
    When I run the "orderSupportUserFlow" user flow against the "local" environment
    Then the user flow run reports all flows passed

  Scenario: a failing user flow surfaces a non-zero exit code
    When I run the "failingUserFlow" user flow against the "local" environment
    Then the user flow run exits non-zero

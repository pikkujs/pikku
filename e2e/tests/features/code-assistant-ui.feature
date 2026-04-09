@code-assistant-ui @console
Feature: Dynamic Agents Addon (Console UI)

  Background:
    Given the API is available

  Scenario: Dynamic agents addon is visible on the addons page
    When I navigate to the addons page
    Then I should see addon "code-assistant" with package "@pikku/code-assistant"

  Scenario: New Agent page renders with form elements
    When I navigate to the new agent page
    Then I should see the agent prompt textarea
    And I should see the generate agent button
    And I should see the agent tool filter select
    And I should see the sub-agents toggle

  Scenario: New Agent button on agents page navigates to new page
    When I navigate to the agents page
    And I click the new agent button
    Then I should be on the new agent page

  @ai
  Scenario: Generate agent from UI and view success
    When I navigate to the new agent page
    And I enter the agent prompt "Create an agent that helps users manage their todos by listing, creating, and completing todos"
    And I click the generate agent button
    Then I should see the agent generation timeline
    And the agent generation should complete with success

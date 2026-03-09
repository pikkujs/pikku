@agent-modes @console @ai
Feature: Agent Delegation Modes
  Tests delegate vs supervise agent modes.
  Delegate mode: sub-agent streams directly to user, parent text suppressed after delegation.
  Supervise mode: sub-agent returns result to parent, parent responds to user.

  # Delegate mode (default) — router agent
  Scenario: Delegate mode — parent responds directly when no delegation needed
    Given I open the "routerAgent" playground
    When I send "Hello, what can you help me with?"
    Then I should see "todo" in the chat

  Scenario: Delegate mode — sub-agent text reaches client
    Given I open the "routerAgent" playground
    When I send "List my todos"
    Then I should see "Review pull requests" in the chat

  # Supervise mode — supervisor agent
  Scenario: Supervise mode — parent summarizes sub-agent result with prefix
    Given I open the "supervisorAgent" playground
    When I send "List my todos"
    Then I should see "SUPERVISOR:" in the chat
    And I should see "Review pull requests" in the chat

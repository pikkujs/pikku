@router @console
Feature: Router Agent via Console
  The router-agent delegates requests to domain agents.

  # Existing todo routing
  Scenario: Route to todo-agent for listing
    Given I open the "routerAgent" playground
    When I send "List my todos"
    Then I should see "Review pull requests" in the chat

  Scenario: Route to todo-agent with approval — shows approval description
    Given I open the "routerAgent" playground
    When I send "Add a todo called 'Routed todo'"
    Then I should see an approval request
    And the approval reason should contain "Add a todo called"
    And the approval reason should contain "Routed todo"
    When I click "Approve"
    Then I should see "Routed todo" in the chat

  # Email routing
  Scenario: Route to email-agent for sending (approved) — shows approval description
    Given I open the "routerAgent" playground
    When I send "Send an email to alice@test.com with subject 'Hello' and body 'Hi Alice'"
    Then I should see an approval request
    And the approval reason should contain "Send an email to"
    And the approval reason should contain "alice@test.com"
    When I click "Approve"
    Then I should see "alice@test.com" in the chat

  Scenario: Route to email-agent for sending (denied)
    Given I open the "routerAgent" playground
    When I send "Send an email to bob@test.com with subject 'Meeting' and body 'See you at 3pm'"
    Then I should see an approval request
    And the approval reason should contain "Send an email to"
    And the approval reason should contain "bob@test.com"
    When I click "Deny"
    Then I should see "Denied" on the approval badge

  # Cross-agent routing in one conversation
  Scenario: Route to todo-agent then email-agent in same thread
    Given I open the "routerAgent" playground
    When I send "List my todos"
    And I wait for the response
    Then I should see "Buy groceries" in the chat
    When I send "Send an email to team@test.com with subject 'Todo update' and body 'Check the todos'"
    Then I should see an approval request
    When I click "Approve"
    Then I should see "team@test.com" in the chat

  # Cross-agent approvals
  Scenario: Cross-agent approvals — add todo and send email
    Given I open the "routerAgent" playground
    When I send "Add a todo called 'Email the team' and send an email to team@test.com with subject 'New task' and body 'Added a task'"
    Then I should see an approval request
    When I approve all pending requests
    Then I should see "Email the team" in the chat
    And I should see "team@test.com" in the chat

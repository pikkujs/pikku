@todo @console @ai
Feature: Todo Agent via Console
  The todo-agent manages a todo list. Tests interact with it through
  the Pikku Console agent playground UI.

  # The list / deny / batch-approve-all / delete-reason scenarios were retired
  # once the deterministic @agent-approval protocol suite covered the same
  # suspend/approve/deny/reason behaviour without a browser or a live model.
  # What remains here is assistant-ui interaction a protocol test cannot see:
  # the approval card render, mixed approve/deny across cards, and a full
  # multi-turn conversation in the composer.

  Scenario: Add a todo (approved) — shows approval description and uppercase response
    Given I open the "todoAgent" playground
    When I send "Add a todo called 'Write e2e tests'"
    Then I should see an approval request
    And the approval reason should contain "Add a todo called"
    And the approval reason should contain "Write e2e tests"
    When I click "Approve"
    Then I should see exactly "WRITE E2E TESTS" in the chat

  Scenario: Add three todos in one prompt (approve 2, deny 1)
    Given I open the "todoAgent" playground
    When I send "Create these 3 todos: 'Learn to juggle', 'Eat a cloud', 'Befriend a squirrel'"
    Then I should see 3 approval requests
    When I deny the 2nd approval and approve the rest
    Then I should see 2 "Done" badges in the chat
    And I should see 1 "Denied" badges in the chat
    And I should see "Learn to juggle" in the chat
    And I should see "Befriend a squirrel" in the chat

  Scenario: Delete a todo shows approval with reason
    Given I open the "todoAgent" playground
    When I send "Delete the todo with id 1"
    Then I should see an approval request
    And the approval reason should contain "Buy groceries"
    When I click "Approve"
    Then I should see exactly "DELETED" in the chat

  Scenario: Full conversation — list, add, deny, batch add, delete, verify
    Given I open the "todoAgent" playground

    # 1. List existing todos — response uppercased by AI middleware
    When I send "How many todos do I have? List them."
    And I wait for the response
    Then I should see exactly "BUY GROCERIES" in the chat

    # 2. Add a todo and approve it — approval description shown
    When I send "Add a todo called 'Organize sock drawer'"
    Then I should see an approval request
    And the approval reason should contain "Organize sock drawer"
    When I click "Approve"
    And I wait for the response
    Then I should see "Organize sock drawer" in the chat

    # 3. Try to add another but deny it
    When I send "Add a todo called 'Climb Mount Everest barefoot'"
    Then I should see an approval request
    When I click "Deny"
    And I wait for the response
    Then I should see "denied" on the approval badge

    # 4. Add two more (approve each as they come)
    When I send "Add these 2 todos: 'Alphabetize the spice rack' and 'Polish the doorknobs'"
    Then I should see an approval request
    When I approve all pending requests
    Then I should see "Alphabetize the spice rack" in the chat
    And I should see "Polish the doorknobs" in the chat

    # 5. Delete 'Organize sock drawer' (which we just added)
    When I send "Delete the todo called 'Organize sock drawer'"
    Then I should see an approval request
    When I click "Approve"
    And I wait for the response

    # 6. Final listing — our two batch todos should be there, the deleted one should not
    When I send "List all my current todos please"
    And I wait for the response
    Then I should see "Alphabetize the spice rack" in the chat
    And I should see "Polish the doorknobs" in the chat
    And the last assistant message should not contain "Organize sock drawer"

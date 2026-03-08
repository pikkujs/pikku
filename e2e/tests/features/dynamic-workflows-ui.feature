@dynamic-workflows-ui @console
Feature: Dynamic Workflows via Todo Agent (Console UI)
  The todo-agent has dynamicWorkflows enabled, allowing it to create,
  save, and execute workflows through the Console agent playground.

  Scenario: Create, save, list and execute a workflow via chat
    Given I open the "todoAgent" playground
    When I send "Use createAgentWorkflow to create a workflow called 'add-and-list' with two nodes: first node calls todos:addTodo with input title 'Workflow task', second node calls todos:listTodos. The first node should flow to the second. Then save it using saveAgentWorkflow."
    And I wait for the response
    Then I should see "add-and-list" in the chat
    And I should see "saved" in the chat

    When I send "Use listAgentWorkflows to show my workflows"
    And I wait for the response
    Then I should see "add-and-list" in the chat

    When I send "Use executeAgentWorkflow to run the 'add-and-list' workflow"
    And I wait for the response
    Then I should not see "error" in the chat

  Scenario: Natural language workflow creation and execution via chat
    Given I open the "todoAgent" playground
    When I send "Create a workflow that adds a todo from the trigger's title, then lists all todos. Save it when ready."
    And I wait for the response
    Then I should see "workflow" in the chat
    And I should not see "error" in the chat

    When I send "Run that workflow with the title 'UI test item'."
    And I wait for the response
    Then I should not see "error" in the chat

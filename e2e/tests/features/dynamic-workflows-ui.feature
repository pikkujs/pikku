@dynamic-workflows-ui @console
Feature: Dynamic Workflows via Todo Agent (Console UI)
  The todo-agent has dynamicWorkflows enabled, allowing it to create,
  save, and execute workflows through the Console agent playground.

  Scenario: Create, save, list and execute a workflow via chat
    Given I open the "todoAgent" playground
    When I send "Use createAgentWorkflow to create a workflow called 'add-and-list' with two nodes: first node calls todos:addTodo with input title 'Workflow task', second node calls todos:listTodos. The first node should flow to the second. Then save it using saveAgentWorkflow."
    Then I should see an approval request
    When I approve all pending requests
    And I wait for the response
    Then I should see "add-and-list" in the chat
    And I should see "saveAgentWorkflow" in the chat

    When I send "Use listAgentWorkflows to show my workflows"
    And I wait for the response
    Then I should see "add-and-list" in the chat

    When I send "Use executeAgentWorkflow to run the 'add-and-list' workflow"
    Then I should see an approval request
    When I approve all pending requests
    And I wait for the response
    Then I should not see "error" in the chat

  Scenario: AI-created workflow appears on the Workflows page
    Given I open the "ultimateAgent" playground
    When I send "Create a workflow called 'add-sleep-list' with three nodes: first 'add' calls todos:addTodo with title from trigger's title, then 'wait' calls graph:sleep for 1 second, then 'list' calls todos:listTodos. Chain them add → wait → list. Save it."
    Then I should see an approval request
    When I approve all pending requests
    And I wait for the response
    Then I should see "saveAgentWorkflow" in the chat
    When I open the workflows page
    Then I should see "add-sleep-list" on the page
    And I should see "AI Agent" on the page

  @skip
  Scenario: Creative complex workflow using all available tools
    Given I open the "ultimateAgent" playground
    When I send "Create a workflow called 'kitchen-sink' that showcases EVERY advanced workflow feature. Requirements: 1) It MUST have parallel branches (next as an array to fan out into concurrent paths). 2) It MUST have conditional branching (next as an object like {\"true\": \"nodeA\", \"false\": \"nodeB\"}). 3) It MUST have an onError handler on at least one node. 4) It MUST use at least 8 different tools including todos, emails, sleep, math, and stringTransform. 5) It MUST wire data between nodes using $ref. 6) It must have at least 10 nodes total. Be creative — this is a stress test. Save it when ready."
    Then I should see an approval request
    When I approve all pending requests
    And I wait for the response
    Then I should see "saveAgentWorkflow" in the chat
    When I open the workflows page
    Then I should see "kitchen-sink" on the page
    And I should see "AI Agent" on the page

  Scenario: Natural language workflow creation and execution via chat
    Given I open the "todoAgent" playground
    When I send "Create a workflow that adds a todo from the trigger's title, then lists all todos. Save it when ready."
    Then I should see an approval request
    When I approve all pending requests
    And I wait for the response
    Then I should see "workflow" in the chat

    When I send "Run that workflow with the title 'UI test item'."
    Then I should see an approval request
    When I approve all pending requests
    And I wait for the response
    Then I should not see "error" in the chat

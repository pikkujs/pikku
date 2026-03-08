@dynamic-workflows
Feature: Dynamic Workflows via Todo Agent (API)
  The todo-agent has dynamicWorkflows enabled, allowing it to create,
  save, and execute workflows using its existing tools.
  These tests verify the workflows are actually persisted and executed
  by checking the workflow service directly.

  Background:
    Given the API is available

  Scenario: Explicit workflow creation with tool names
    When I send the agent "todoAgent" the message "Use createAgentWorkflow to create a workflow called 'add-and-list' with two nodes: first node calls todos:addTodo with input title 'Workflow task', second node calls todos:listTodos. The first node should flow to the second. Then save it using saveAgentWorkflow."
    Then the agent response should contain "add-and-list"
    And the agent response should contain "saved"

    When I send the agent "todoAgent" the message "Use listAgentWorkflows to show my workflows"
    Then the agent response should contain "add-and-list"

    When I send the agent "todoAgent" the message "Use executeAgentWorkflow to run the 'add-and-list' workflow"
    Then the agent response should not contain "error"

    When I query the console RPC "console:getWorkflowRuns"
    Then the console response should have a run for "ai:todoAgent:add-and-list" with status "completed"

  Scenario Outline: Natural language workflow - <style>
    When I send the agent "todoAgent" the message "<create_prompt> Save it when ready."
    Then the agent response should contain "workflow"
    And the agent response should not contain "error"

    When I send the agent "todoAgent" the message "Run that workflow with the title 'Sleep test item'."
    Then the agent response should not contain "error"

    When I query the console RPC "console:getWorkflowRuns"
    Then the console response should have a completed run

    When I call the RPC "todos:listTodos"
    Then a new completed todo should exist

    Examples:
      | style      | create_prompt                                                                                                                                           |
      | technical  | Create a workflow that takes a title from the trigger input, adds a todo with that title, sleeps for 20 seconds, then completes the todo using the id from the addTodo result. |
      | structured | Build a workflow: step 1 - create a todo from the trigger's title, step 2 - wait 20 seconds, step 3 - mark the todo as completed.                       |
      | casual     | Make me a workflow that adds a todo by name, waits 20 seconds, and then marks it done.                                                                  |
      | minimal    | Workflow: add todo from input title, sleep 20s, complete it.                                                                                            |
      | vague      | I want a workflow that creates a task, pauses a bit, then finishes it.                                                                                  |

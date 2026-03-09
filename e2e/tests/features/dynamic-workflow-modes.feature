@dynamic-workflow-modes @ai
Feature: Dynamic Workflow Modes (read / always / ask)
  Tests that the three dynamicWorkflows modes provide the correct
  tools and behavioral constraints to agents.

  Background:
    Given the API is available

  # ── read mode ──────────────────────────────────────────────────────

  Scenario: Read mode — can list workflows
    When I send the agent "todoReadAgent" the message "Use listAgentWorkflows to show available workflows"
    Then the agent response should not contain "error"

  @skip
  Scenario: Read mode — can execute an existing workflow
    # First create a workflow via the always-mode agent so there's something to execute
    When I send the agent "todoAgent" the message "Use createAgentWorkflow to create a workflow called 'read-exec-test' with two nodes: first node 'add' calls todos:addTodo with input title 'Read mode item', second node 'list' calls todos:listTodos. The first node should flow to the second. Then save it using saveAgentWorkflow."
    And I approve all pending approvals
    Then the agent response should contain "read-exec-test"

    # Now the read-mode agent should be able to list and execute it
    When I send the agent "todoReadAgent" the message "Use listAgentWorkflows to show available workflows"
    Then the agent response should contain "read-exec-test"

    When I send the agent "todoReadAgent" the message "Use executeAgentWorkflow to run the 'read-exec-test' workflow"
    And I approve all pending approvals
    Then the agent response should not contain "error"

  Scenario: Read mode — cannot create workflows
    When I send the agent "todoReadAgent" the message "Use createAgentWorkflow to create a workflow called 'should-fail' with two nodes: first 'add' calls todos:addTodo with title 'nope', second 'list' calls todos:listTodos. Chain add to list."
    Then the agent response should not contain "validated"
    And the agent response should not contain "draft"

  Scenario: Read mode — cannot save workflows
    When I send the agent "todoReadAgent" the message "Use saveAgentWorkflow to activate a workflow called 'nonexistent' with graphHash 'abc123'"
    Then the agent response should not contain "activated"

  # ── always mode ────────────────────────────────────────────────────

  Scenario: Always mode — full create, save, list, execute cycle
    When I send the agent "todoAgent" the message "Use createAgentWorkflow to create a workflow called 'always-mode-test' with two nodes: first node 'add' calls todos:addTodo with input title 'Always mode item', second node 'list' calls todos:listTodos. The first node should flow to the second. Then save it using saveAgentWorkflow."
    And I approve all pending approvals
    Then the agent response should contain "always-mode-test"
    And the agent response should contain "activated"

    When I send the agent "todoAgent" the message "Use listAgentWorkflows to show my workflows"
    Then the agent response should contain "always-mode-test"

    When I send the agent "todoAgent" the message "Use executeAgentWorkflow to run the 'always-mode-test' workflow"
    And I approve all pending approvals
    Then the agent response should not contain "error"

    When I query the console RPC "console:getWorkflowRuns"
    Then the console response should have a run for "ai:todoAgent:always-mode-test" with status "completed"

  # ── ask mode ───────────────────────────────────────────────────────

  Scenario: Ask mode — has all four workflow tools when explicitly instructed
    When I send the agent "todoAskAgent" the message "Use createAgentWorkflow to create a workflow called 'ask-mode-test' with two nodes: first node 'add' calls todos:addTodo with input title 'Ask mode item', second node 'list' calls todos:listTodos. The first node should flow to the second. Then save it using saveAgentWorkflow."
    And I approve all pending approvals
    Then the agent response should contain "ask-mode-test"
    And the agent response should contain "activated"

  Scenario: Ask mode — can list and execute workflows
    # Create first
    When I send the agent "todoAskAgent" the message "Use createAgentWorkflow to create a workflow called 'ask-exec-test' with two nodes: first node 'add' calls todos:addTodo with input title 'Ask exec item', second node 'list' calls todos:listTodos. The first node should flow to the second. Then save it using saveAgentWorkflow."
    And I approve all pending approvals
    Then the agent response should contain "ask-exec-test"

    When I send the agent "todoAskAgent" the message "Use listAgentWorkflows to show my workflows"
    Then the agent response should contain "ask-exec-test"

    When I send the agent "todoAskAgent" the message "Use executeAgentWorkflow to run the 'ask-exec-test' workflow"
    And I approve all pending approvals
    Then the agent response should not contain "error"

  Scenario: Ask mode — does not auto-create workflows for natural requests
    When I send the agent "todoAskAgent" the message "I need to add a todo called 'test item', wait 5 seconds, then complete it."
    Then the agent response should not contain "createAgentWorkflow"

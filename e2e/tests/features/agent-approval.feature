@agent-protocol @agent-approval
Feature: Approval-gated tools suspend, resume, and honour the decision

  A tool declared `approvalRequired` suspends the run when the model calls it:
  the sync response carries `status: "suspended"` and a `pendingApprovals` entry
  per call, each with the human-readable reason built by `approvalDescription`.
  Approving resumes and executes the tool; denying resumes without executing it.
  These deterministic protocol checks replace the browser-driven console
  approval scenarios (todo list/deny/batch/delete-reason).

  Scenario: Output middleware uppercases the run result
    When I run approval agent "todoAgent" as "alice" with script "text-only" and message "say something"
    Then the run result is "THE MOCK MODEL REPLIED WITH PLAIN TEXT."

  Scenario: An approval-gated add suspends with its reason, then executes on approval
    Given the todo list is reset
    When I run approval agent "todoAgent" as "alice" with script "add-todo-then-text" and message "add a todo"
    Then the run is suspended for approval
    And there are 1 pending approvals
    And a pending approval reason contains "Add a todo called \"Write e2e tests\""
    When I approve all pending tool calls
    Then the run is no longer suspended
    And the todo list should contain "Write e2e tests"

  Scenario: A denied approval resumes without executing the tool
    Given the todo list is reset
    When I run approval agent "todoAgent" as "alice" with script "add-todo-then-text" and message "add a todo"
    Then the run is suspended for approval
    When I deny all pending tool calls
    Then the run is no longer suspended
    And the todo list does not contain "Write e2e tests"

  Scenario: A delete approval reason names the target record
    Given the todo list is reset
    When I run approval agent "todoAgent" as "alice" with script "delete-todo-then-text" and message "delete todo 1"
    Then the run is suspended for approval
    And a pending approval reason contains "Delete the todo called \"Buy groceries\""

  Scenario: Several approval-gated calls in one turn all suspend and all execute
    Given the todo list is reset
    When I run approval agent "todoAgent" as "alice" with script "three-todos-then-text" and message "add three todos"
    Then the run is suspended for approval
    And there are 3 pending approvals
    When I approve all pending tool calls
    Then the run is no longer suspended
    And the thread recorded 3 tool executions of "todos__addTodo"

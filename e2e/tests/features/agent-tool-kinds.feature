@agent-protocol @agent-tool-kinds
Feature: Every kind of tool is resolved and offered to the model

  An agent can mix tool kinds: a first-party RPC function, a `graph:*` builtin,
  and another agent exposed as a sub-agent tool. Each kind is resolved at
  prepare time and offered to the model under its sanitised name (`:` becomes
  `__`), and each carries an input schema.

  Scenario: RPC, graph-builtin and sub-agent tools are all offered
    When I run agent "toolKindsAgent" with script "text-only" and message "what tools do you have"
    Then model call 1 was offered the tool "todos__listTodos"
    And model call 1 was offered the tool "graph__math"
    And model call 1 was offered the tool "toolKindsHelperAgent"
    And every offered tool has an input schema

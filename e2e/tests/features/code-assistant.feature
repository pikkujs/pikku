@code-assistant
Feature: Dynamic Agents Addon (API)

  Background:
    Given the API is available

  Scenario: List available tools for agent creation
    When I list available agent tools
    Then the agent tool list should not be empty
    And the agent tool list should not contain internal functions
    And the agent tool list should contain "doubleValue"

  Scenario: Get tool schemas for agent design
    When I get agent tool schemas for:
      | name        |
      | doubleValue |
    Then the agent schema details should contain "doubleValue"

  Scenario: List available middleware
    When I list available agent middleware
    Then the middleware list should include "voiceInput"
    And the middleware list should include "voiceOutput"

  Scenario: Validate a correct agent config
    When I validate the agent config:
      """
      {
        "config": {
          "instructions": "You help users by doubling numbers. Use the doubleValue tool when a user asks to double a number. Pass the number as the value parameter.",
          "description": "Doubles numbers for users",
          "model": "openai/o4-mini",
          "tools": ["doubleValue"],
          "maxSteps": 10,
          "toolChoice": "auto"
        },
        "availableToolNames": ["doubleValue", "formatMessage", "categorize"]
      }
      """
    Then the agent config validation should pass

  Scenario: Validate rejects config with invalid tool
    When I validate the agent config:
      """
      {
        "config": {
          "instructions": "You help users with tasks using nonExistentTool.",
          "description": "Test agent",
          "model": "openai/o4-mini",
          "tools": ["nonExistentTool"],
          "maxSteps": 10,
          "toolChoice": "auto"
        },
        "availableToolNames": ["doubleValue"]
      }
      """
    Then the agent config validation should fail
    And the agent config errors should mention "nonExistentTool"

  Scenario: Validate rejects config with empty instructions
    When I validate the agent config:
      """
      {
        "config": {
          "instructions": "",
          "description": "Test agent",
          "model": "openai/o4-mini",
          "tools": ["doubleValue"],
          "maxSteps": 10,
          "toolChoice": "auto"
        },
        "availableToolNames": ["doubleValue"]
      }
      """
    Then the agent config validation should fail
    And the agent config errors should mention "instructions"

  Scenario: Validate rejects config with invalid model format
    When I validate the agent config:
      """
      {
        "config": {
          "instructions": "You help users by doubling numbers using the doubleValue tool.",
          "description": "Test agent",
          "model": "invalid-model",
          "tools": ["doubleValue"],
          "maxSteps": 10,
          "toolChoice": "auto"
        },
        "availableToolNames": ["doubleValue"]
      }
      """
    Then the agent config validation should fail
    And the agent config errors should mention "model"

  @ai
  Scenario: Generate an agent from prompt and verify file
    When I generate a dynamic agent with:
      | prompt                                                                                                    | toolFilter |
      | Create an agent that helps users manage their todos. It should list, create, and complete todos for them. | todos:listTodos,todos:addTodo,todos:completeTodo |
    Then the dynamic agent generation should complete
    And the generated agent should have a name
    And the generated agent should have a file path

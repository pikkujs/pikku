@code-assistant
Feature: Dynamic Agents Addon (API)

  Background:
    Given the API is available

  @ai
  Scenario: Generate an agent from prompt and verify file
    When I generate a dynamic agent with:
      | prompt                                                                                                    | toolFilter |
      | Create an agent that helps users manage their todos. It should list, create, and complete todos for them. | todos:listTodos,todos:addTodo,todos:completeTodo |
    Then the dynamic agent generation should complete
    And the generated agent should have a name
    And the generated agent should have a file path

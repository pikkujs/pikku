@code-editor
Feature: Console Code Editor

  Background:
    Given the API is available

  Scenario: Read function source via RPC
    When I read the source of function "editableFunc"
    Then the function source should have wrapper "pikkuSessionlessFunc"
    And the function config "title" should be "Editable Function"
    And the function config "expose" should be true
    And the function body should contain "Hello"

  Scenario: Update function description and restore
    When I update the function "editableFunc" config:
      | key         | value              |
      | description | Updated by e2e test |
    Then the update should succeed
    When I read the source of function "editableFunc"
    Then the function config "description" should be "Updated by e2e test"
    And the function config "title" should be "Editable Function"
    # Restore original
    When I update the function "editableFunc" config:
      | key         | value                                                 |
      | description | A function used for e2e testing of the code editor    |
    Then the update should succeed

  Scenario: Update and restore function body
    When I read the body of function "editableFunc"
    Then the function body should contain "Hello"
    When I update the function "editableFunc" body to:
      """
      async (_services, { name }) => {
        return { greeting: `Hi there, ${name}!` }
      }
      """
    Then the update should succeed
    When I read the body of function "editableFunc"
    Then the function body should contain "Hi there"
    # Restore original
    When I update the function "editableFunc" body to:
      """
      async (_services, { name }) => {
        return { greeting: `Hello, ${name}!` }
      }
      """
    Then the update should succeed

  Scenario: Read agent source via RPC
    When I read the source of agent "todoReadAgent"
    Then the agent config "name" should be "todo-read-agent"
    And the agent config "model" should be "openai/o4-mini"
    And the agent config "maxSteps" should be 10

  Scenario: Update and restore agent instructions
    When I update the agent "todoReadAgent" config:
      | key          | value                          |
      | instructions | Updated instructions for e2e   |
    Then the update should succeed
    When I read the source of agent "todoReadAgent"
    Then the agent config "instructions" should be "Updated instructions for e2e"
    And the agent config "name" should be "todo-read-agent"
    # Restore original
    When I update the agent "todoReadAgent" config:
      | key          | value                                                                                                              |
      | instructions | You help users manage their todos. You can list all todos, get details of a specific todo, add new todos, and delete todos. |
    Then the update should succeed

  @console
  Scenario: Function panel shows edit button for local functions
    When I navigate to the functions page
    And I click on function "editableFunc"
    Then I should see the edit button

  @console
  Scenario: Agent panel shows edit button for local agents
    When I navigate to the agents page
    And I click on agent "todoReadAgent"
    Then I should see the edit button

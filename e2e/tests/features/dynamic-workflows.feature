@dynamic-workflows
Feature: Dynamic Workflows Addon (API)

  Background:
    Given the API is available

  Scenario: List available functions for dynamic workflows
    When I list dynamic functions
    Then the function list should not be empty
    And the function list should not contain internal functions
    And the function list should contain "doubleValue"

  Scenario: Get function schemas for selected functions
    When I get schemas for functions:
      | name        |
      | doubleValue |
    Then the schema details should contain "doubleValue"

  Scenario: Validate a correct workflow graph
    When I validate the workflow graph:
      """
      {
        "nodes": {
          "step1": { "rpcName": "doubleValue", "input": { "value": { "$ref": "trigger", "path": "value" } } }
        },
        "functionNames": ["doubleValue"]
      }
      """
    Then the validation should pass
    And the entry nodes should include "step1"

  Scenario: Validate rejects invalid graph with missing function
    When I validate the workflow graph:
      """
      {
        "nodes": {
          "step1": { "rpcName": "nonExistentFunc" }
        },
        "functionNames": ["doubleValue"]
      }
      """
    Then the validation should fail
    And the validation errors should mention "nonExistentFunc"

  Scenario: Validate rejects graph with broken next reference
    When I validate the workflow graph:
      """
      {
        "nodes": {
          "step1": { "rpcName": "doubleValue", "next": "missingNode" }
        },
        "functionNames": ["doubleValue"]
      }
      """
    Then the validation should fail
    And the validation errors should mention "missingNode"

  Scenario: Validate multi-step workflow with sequential nodes
    When I validate the workflow graph:
      """
      {
        "nodes": {
          "double": { "rpcName": "doubleValue", "input": { "value": { "$ref": "trigger", "path": "value" } }, "next": "format" },
          "format": { "rpcName": "formatMessage", "input": { "greeting": { "$ref": "trigger", "path": "greeting" }, "name": { "$ref": "trigger", "path": "name" } } }
        },
        "functionNames": ["doubleValue", "formatMessage"]
      }
      """
    Then the validation should pass
    And the entry nodes should include "double"

  @ai
  Scenario: Generate a complex multi-step workflow from prompt and run it
    When I generate a dynamic workflow with:
      | prompt                                                                                                                                                                                                                                                             | functionFilter                                        |
      | The trigger input has {score: number, email: string}. Double the score using doubleValue, categorize the doubled result using categorize, format a greeting using formatMessage with the category as greeting and a static name, then sendNotification to the email | doubleValue,categorize,formatMessage,sendNotification |
    Then the dynamic workflow generation should complete
    And the generated workflow should have a name
    When I run the generated dynamic workflow with:
      | score | email            |
      | 40    | test@example.com |
    Then the dynamic workflow run should complete

  @ai
  Scenario: Generate a 15-node workflow with parallel branches and convergence
    When I generate a dynamic workflow with:
      | prompt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | functionFilter                                                       |
      | The trigger input is {score: number, email: string, name: string}. Build a 15-node workflow: (1) doubleValue the score. (2) In PARALLEL: branch A categorizes the doubled result, branch B doubles the doubled result again, branch C greets the name with editableFunc. (3) After branch A: formatMessage using category as greeting and name from trigger. (4) After branch B: categorize the re-doubled result. (5) After branch C: formatMessage using the editableFunc greeting as greeting and name from trigger. (6) After step 3 and step 5 both finish: sendNotification to email with step 3's message as subject and step 5's message as body. (7) After step 4: formatMessage using that category as greeting and name "Summary". (8) After step 6 and step 7: sendNotification to email with step 7's message as subject and "Final report" as body. Use exactly 15 nodes. | doubleValue,categorize,formatMessage,sendNotification,editableFunc |
    Then the dynamic workflow generation should complete
    And the generated workflow should have a name
    When I run the generated dynamic workflow with:
      | score | email            | name     |
      | 25    | test@example.com | Pipeline |
    Then the dynamic workflow run should complete

  @ai
  Scenario: Generate a simple dynamic workflow from prompt and run it
    When I generate a dynamic workflow with:
      | prompt                                                                                               | functionFilter |
      | Take a number value, double it using doubleValue, then use the doubled result as the value to double again | doubleValue    |
    Then the dynamic workflow generation should complete
    And the generated workflow should have a name
    When I run the generated dynamic workflow with:
      | value | name |
      | 5     | Test |
    Then the dynamic workflow run should complete

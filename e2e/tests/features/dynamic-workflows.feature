@dynamic-workflows
Feature: Dynamic Workflows Addon (API)

  Background:
    Given the API is available

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

@dynamic-workflows-ui @console
Feature: Dynamic Workflows Addon (Console UI)

  Background:
    Given the API is available

  Scenario: Dynamic workflows addon is visible on the addons page
    When I navigate to the addons page
    Then I should see addon "dynamic-workflows" with package "@pikku/addon-dynamic-workflows"

  Scenario: New Workflow page renders with form elements
    When I navigate to the new workflow page
    Then I should see the workflow prompt textarea
    And I should see the generate workflow button
    And I should see the function filter select

  Scenario: New Workflow button on workflows page navigates to new page
    When I navigate to the workflows page
    And I click the new workflow button
    Then I should be on the new workflow page

  @ai
  Scenario: Generate complex 15-node workflow from UI, view it, and run it
    When I navigate to the new workflow page
    And I enter the workflow prompt "The trigger input is {score: number, email: string, name: string}. Build a 15-node workflow: (1) doubleValue the score. (2) In PARALLEL: branch A categorizes the doubled result, branch B doubles the doubled result again, branch C greets the name with editableFunc. (3) After branch A: formatMessage using category as greeting and name from trigger. (4) After branch B: categorize the re-doubled result. (5) After branch C: formatMessage using the editableFunc greeting as greeting and name from trigger. (6) After step 3 and step 5 both finish: sendNotification to email with step 3's message as subject and step 5's message as body. (7) After step 4: formatMessage using that category as greeting and name Summary. (8) After step 6 and step 7: sendNotification to email with step 7's message as subject and Final report as body. Use exactly 15 nodes."
    And I click the generate workflow button
    Then I should see the generation timeline
    And the generation should complete with success
    When I click the view workflow button
    Then I should see the workflow graph canvas
    When I run the workflow from the console with:
      | score | email            | name     |
      | 25    | test@example.com | Pipeline |
    Then the workflow run should show as completed

@scenarios-console @console
Feature: Scenarios Console UI

  The Workflows page toggles between Workflows, Scenarios, and Personas.
  Scenarios (pikkuScenario) are hidden from the default Workflows view;
  the Personas view renders the actors from pikku.config.json scenarios.actors.

  Background:
    Given the API is available

  Scenario: Workflows view hides scenarios by default
    When I navigate to the workflows page
    Then the entity card "dslSequentialWorkflow" should be visible
    And the entity card "orderSupportScenario" should not be visible

  Scenario: Scenarios view lists only scenarios with badge and actors
    When I navigate to the workflows page
    And I switch the workflows view to "Scenarios"
    Then the entity card "orderSupportScenario" should be visible
    And the entity card "dslSequentialWorkflow" should not be visible
    And the entity card "orderSupportScenario" should contain "Scenario"
    And the entity card "orderSupportScenario" should contain "shopper, support"

  Scenario: Personas view renders the configured actors
    When I navigate to the workflows page
    And I switch the workflows view to "Personas"
    Then the entity card "shopper" should be visible
    And the entity card "support" should be visible
    And the entity card "shopper" should contain "shopper@actors.local"
    And the entity card "support" should contain "Support agent"
    And the entity card "support" should contain "Methodical agent who double-checks every order"

  Scenario: Switching back to Workflows restores the default list
    When I navigate to the workflows page
    And I switch the workflows view to "Scenarios"
    And I switch the workflows view to "Workflows"
    Then the entity card "dslSequentialWorkflow" should be visible
    And the entity card "orderSupportScenario" should not be visible

@user-flows-console @console
Feature: User Flows Console UI

  The Workflows page toggles between Workflows, User Flows, and Personas.
  User flows (pikkuUserFlow) are hidden from the default Workflows view;
  the Personas view renders the actors from pikku.config.json userFlows.actors.

  Background:
    Given the API is available

  Scenario: Workflows view hides user flows by default
    When I navigate to the workflows page
    Then the entity card "dslSequentialWorkflow" should be visible
    And the entity card "orderSupportUserFlow" should not be visible

  Scenario: User Flows view lists only user flows with badge and actors
    When I navigate to the workflows page
    And I switch the workflows view to "User Flows"
    Then the entity card "orderSupportUserFlow" should be visible
    And the entity card "dslSequentialWorkflow" should not be visible
    And the entity card "orderSupportUserFlow" should contain "User Flow"
    And the entity card "orderSupportUserFlow" should contain "shopper, support"

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
    And I switch the workflows view to "User Flows"
    And I switch the workflows view to "Workflows"
    Then the entity card "dslSequentialWorkflow" should be visible
    And the entity card "orderSupportUserFlow" should not be visible

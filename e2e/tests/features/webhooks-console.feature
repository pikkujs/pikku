@webhooks-console @console
Feature: Webhooks Console Page

  Background:
    Given the API is available

  Scenario: A delivered webhook shows on the console with its attempt history
    Given I trigger a webhook delivery to the local sink
    When I navigate to the webhooks page
    Then I should see the delivery URL on the webhooks page
    And the delivery status should become "delivered"
    And I should see attempt "#1" with status 200 in the delivery drawer

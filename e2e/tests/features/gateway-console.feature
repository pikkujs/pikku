@gateway-console @console
Feature: Gateway Console UI

  Background:
    Given the API is available

  Scenario: Gateway metadata is visible in the console
    When I open the Gateways tab in the console
    Then I should see gateway "e2e-webhook" with route "/webhooks/e2e-gateway"

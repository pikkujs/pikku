@tests-console @console
Feature: Tests Console UI

  Background:
    Given the API is available

  Scenario: Tests page shows empty state before any run
    When I open the tests page
    Then I should see "No test data yet" on the page

  Scenario: Run tests button initiates the SSE stream and returns to idle on completion
    When I open the tests page
    And I click "Run tests"
    Then the "Run tests" button becomes enabled

  Scenario: Tests page shows live scenario names during a test run
    When I open the tests page
    And I click "Run tests"
    Then I should see "Double a numeric value" on the page
    And I should see "Format a greeting message" on the page

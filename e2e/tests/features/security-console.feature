@security-console @console
Feature: Security Audit Console Page

  Background:
    Given the API is available

  Scenario: Security page shows an empty state before any audit
    When I open the security page
    Then I should see "No audit report" on the page

  Scenario: Running the audit renders the report
    When I open the security page
    And I click "Run audit"
    Then the "Run audit" button becomes enabled
    And I should see "Vulnerabilities" on the page
    And I should see "Available updates" on the page

@auth @console
Feature: Auth Providers Console Page

  Background:
    Given the API is available

  Scenario: Configured OAuth provider appears with "configured" badge
    When I open the auth providers page in the console
    Then I should see provider "GitHub" in the list
    And provider "GitHub" should be marked as configured

  Scenario: Credentials provider is listed as configured
    When I open the auth providers page in the console
    Then I should see provider "Credentials" in the list
    And provider "Credentials" should be marked as configured

  Scenario: Unconfigured provider appears without configured badge
    When I open the auth providers page in the console
    Then I should see provider "Google" in the list
    And provider "Google" should not be marked as configured

  Scenario: Enabled plugin appears as enabled
    When I open the auth providers page in the console
    Then I should see plugin "bearer" enabled

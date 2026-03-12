@credential
Feature: OAuth2 Credential Flow

  Background:
    Given the API is available
    And the mock OAuth server is running
    And credentials are reset

  Scenario: Full OAuth2 connect and callback stores tokens
    When user "oauth-user-1" initiates OAuth connect for "test-oauth"
    Then the connect response should redirect to the mock provider
    When the OAuth callback is completed for "test-oauth"
    Then credential "test-oauth" for user "oauth-user-1" should exist

  Scenario: OAuth2 status shows connected after flow
    When user "oauth-user-1" initiates OAuth connect for "test-oauth"
    And the OAuth callback is completed for "test-oauth"
    Then the OAuth status for "test-oauth" as user "oauth-user-1" should be connected

  Scenario: OAuth2 status shows disconnected before flow
    Then the OAuth status for "test-oauth" as user "new-user" should be disconnected

  Scenario: OAuth2 disconnect removes credential
    When user "oauth-user-2" initiates OAuth connect for "test-oauth"
    And the OAuth callback is completed for "test-oauth"
    Then the OAuth status for "test-oauth" as user "oauth-user-2" should be connected
    When user "oauth-user-2" disconnects OAuth for "test-oauth"
    Then the OAuth status for "test-oauth" as user "oauth-user-2" should be disconnected

  Scenario: OAuth2 per-user isolation
    When user "alice" initiates OAuth connect for "test-oauth"
    And the OAuth callback is completed for "test-oauth"
    When user "bob" initiates OAuth connect for "test-oauth"
    And the OAuth callback is completed for "test-oauth"
    Then the OAuth status for "test-oauth" as user "alice" should be connected
    And the OAuth status for "test-oauth" as user "bob" should be connected
    When user "alice" disconnects OAuth for "test-oauth"
    Then the OAuth status for "test-oauth" as user "alice" should be disconnected
    And the OAuth status for "test-oauth" as user "bob" should be connected

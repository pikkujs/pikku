@credential-oauth-link
Feature: Per-user OAuth2 credentials via Better Auth account linking

  A wireCredential({ type: 'wire', oauth2 }) is registered as a Better Auth
  genericOAuth provider whose providerId is the credential name, so linking an
  account is what makes getCredential(name) resolve for that user.

  Background:
    Given the API is available
    And the mock OAuth server is running

  Scenario: Linking an account makes the credential resolve
    Given a signed-in user "link-alice"
    Then the "user-oauth" account should not be linked
    And reading the profile should report a missing credential
    When the user links the "user-oauth" provider
    Then the "user-oauth" account should be linked
    And reading the profile should succeed

  Scenario: The link redirect targets the provider's authorize endpoint
    Given a signed-in user "link-redirect"
    When the user starts linking the "user-oauth" provider
    Then the link response should redirect to the mock provider
    And the redirect should carry the declared scopes

  Scenario: Unlinking removes access to the credential
    Given a signed-in user "link-bob"
    When the user links the "user-oauth" provider
    Then reading the profile should succeed
    When the user unlinks the "user-oauth" provider
    Then the "user-oauth" account should not be linked
    And reading the profile should report a missing credential

  Scenario: Linked accounts are isolated per user
    Given a signed-in user "link-carol"
    When the user links the "user-oauth" provider
    Then the "user-oauth" account should be linked
    Given a signed-in user "link-dave"
    Then the "user-oauth" account should not be linked
    And reading the profile should report a missing credential

  Scenario: An expired access token is refreshed on read
    Given a signed-in user "link-erin"
    When the user links the "user-oauth" provider
    And the stored access token has expired
    Then reading the profile should succeed
    And the access token should have been refreshed

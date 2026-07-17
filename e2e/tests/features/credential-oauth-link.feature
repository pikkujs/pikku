@credential-oauth-link
Feature: Per-user OAuth2 credentials via Better Auth account linking

  A wireCredential({ type: 'wire', oauth2 }) is registered as a Better Auth
  genericOAuth provider whose providerId is the credential name, so linking an
  account is what makes credentialService.get(name, userId) resolve — no
  parallel token store, and the token is refreshed on read.

  Background:
    Given the API is available
    And the mock OAuth server is running

  Scenario: Linking an account makes the credential resolve
    Given a signed-in user "alice"
    Then the "user-oauth" account should not be linked
    And the credential "user-oauth" should not resolve for "alice"
    When "alice" links the "user-oauth" provider
    Then the "user-oauth" account should be linked
    And the credential "user-oauth" should resolve for "alice"

  Scenario: The link redirect targets the provider's declared authorize endpoint
    Given a signed-in user "redirect-user"
    When "redirect-user" starts linking the "user-oauth" provider
    Then the link response should redirect to the mock provider
    And the redirect should carry the declared scopes

  Scenario: Unlinking revokes access to the credential
    Given a signed-in user "bob"
    When "bob" links the "user-oauth" provider
    Then the credential "user-oauth" should resolve for "bob"
    When "bob" unlinks the "user-oauth" provider
    Then the "user-oauth" account should not be linked
    And the credential "user-oauth" should not resolve for "bob"

  Scenario: Linked accounts are isolated per user
    Given a signed-in user "carol"
    When "carol" links the "user-oauth" provider
    Then the credential "user-oauth" should resolve for "carol"
    Given a signed-in user "dave"
    Then the "user-oauth" account should not be linked
    And the credential "user-oauth" should not resolve for "dave"
    And the credential "user-oauth" should still resolve for "carol"

  # The custom flow had no refresh at all; delegating to better-auth is the
  # whole point of #844, so pin it.
  Scenario: A linked credential resolves a live access token
    Given a signed-in user "erin"
    When "erin" links the "user-oauth" provider
    Then the credential "user-oauth" should resolve for "erin"
    And the resolved credential should carry an access token from the provider

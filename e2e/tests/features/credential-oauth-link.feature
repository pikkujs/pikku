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

  # A type: 'singleton' credential is the platform's, not the connector's: an
  # admin connects it once and it resolves for everyone, with no userId.
  Scenario: An admin connects a platform-wide credential once for everyone
    Given a signed-in admin "root"
    And a signed-in user "frank"
    When "root" links the "mock-oauth" provider
    Then the platform credential "mock-oauth" should resolve
    And the credential "mock-oauth" should resolve for "frank"

  # better-auth's own unlink acts on the caller's session, so it cannot express
  # "revoke this for that user" — the path an admin console takes. It has to go
  # through credentialService.delete, which is what this pins.
  Scenario: A credential can be revoked server-side without the user's session
    Given a signed-in user "grace"
    When "grace" links the "user-oauth" provider
    Then the credential "user-oauth" should resolve for "grace"
    When the credential "user-oauth" is revoked server-side for "grace"
    Then the credential "user-oauth" should not resolve for "grace"
    And the "user-oauth" account should not be linked

  # The platform user is banned and never holds a session, so a server-side
  # revoke is the ONLY way a singleton can ever be disconnected.
  Scenario: A platform-wide credential can be disconnected
    Given a signed-in admin "root"
    When "root" links the "mock-oauth" provider
    Then the platform credential "mock-oauth" should resolve
    When the platform credential "mock-oauth" is revoked server-side
    Then the platform credential "mock-oauth" should not resolve

  # Revoking is idempotent: a retried disconnect must not turn into an error.
  Scenario: Revoking an unlinked credential succeeds
    Given a signed-in user "heidi"
    When the credential "user-oauth" is revoked server-side for "heidi"
    Then the credential "user-oauth" should not resolve for "heidi"

  # Connecting a singleton rebinds the token for every user, so it cannot be
  # left to any signed-in caller. The 403 is the whole assertion: it is refused
  # before any state is generated, so nothing can be written. Asserting the
  # credential stays unresolved would instead assert global state that the
  # scenario above owns.
  Scenario: A non-admin cannot connect a platform-wide credential
    Given a signed-in user "mallory"
    When "mallory" tries to link the "mock-oauth" provider
    Then the link should be forbidden

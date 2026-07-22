@console-authz
Feature: The console addon's privileged RPCs require an admin session

  The @pikku/addon-console package ships credential, source-editing and install
  RPCs with no authorization of their own — so, before this gate, any
  signed-in user could read another user's OAuth token via console:credentialGet
  by passing their userId. A single global permission registered under the
  addon's package namespace (see src/console-authz.ts) gates every one of its
  functions at once: a signed-in non-admin is refused, only an admin passes.

  Background:
    Given the API is available

  # The sharp edge: credential read returns a resolved access token.
  Scenario: A non-admin is refused a console credential read
    Given a signed-in console user with the seeded "guest" account
    When they call the console RPC "console:credentialGet" with { "name": "user-oauth" }
    Then the console RPC is forbidden

  Scenario: An admin may call the console credential read
    Given a signed-in console user with the seeded "admin" account
    When they call the console RPC "console:credentialGet" with { "name": "user-oauth" }
    Then the console RPC is allowed

  # The vulnerability itself: reaching for ANOTHER user's credential by id.
  Scenario: A non-admin cannot read another user's credential by passing a userId
    Given a signed-in console user with the seeded "guest" account
    When they call the console RPC "console:credentialGet" with { "name": "user-oauth", "userId": "someone-else" }
    Then the console RPC is forbidden

  # One registration covers the whole surface, not just credentials — a
  # different privilege class (metadata read) is gated by the same global.
  Scenario: The gate covers a different console endpoint too
    Given a signed-in console user with the seeded "guest" account
    When they call the console RPC "console:getFunctionsMeta"
    Then the console RPC is forbidden

  Scenario: An admin may read console metadata
    Given a signed-in console user with the seeded "admin" account
    When they call the console RPC "console:getFunctionsMeta"
    Then the console RPC is allowed

  # The user directory replaces better-auth's admin() list-users endpoint. It
  # additionally declares `admin:users:list`, which the umbrella `admin` grant
  # covers — a caller holding neither gets nothing back.
  Scenario: A non-admin is refused the user directory
    Given a signed-in console user with the seeded "guest" account
    When they call the console RPC "pikkuAdminListUsers"
    Then the console RPC is forbidden

  Scenario: An admin may read the user directory
    Given a signed-in console user with the seeded "admin" account
    When they call the console RPC "pikkuAdminListUsers"
    Then the console RPC is allowed

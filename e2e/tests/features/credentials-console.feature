@credentials-console @console
Feature: Console credential access is gated to admins

  The console's credential surface (the @pikku/addon-console RPCs — credential
  read/write and connections) is gated by the console:admin permission. The
  console UI reflects that gate: an admin reaches the Credentials page, while a
  non-admin is refused at the AuthGate before any privileged RPC runs.

  Background:
    Given the API is available

  Scenario: An admin can open the console credentials page
    Given I sign in to the console as the seeded "admin" user
    When I open the Credentials page
    Then I should see the credential connections UI

  Scenario: A non-admin is refused access to the console
    Given I sign in to the console as the seeded "guest" user
    Then I should see the console not-authorized screen

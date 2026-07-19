@addon-instances-console @console
Feature: Each addon instance resolves its own secret

  A package can be wired more than once. Two instances of the same package must
  not share a secret, so each instance remaps the addon's logical secret names
  to its own via overrides. When more than one instance is installed, the
  console's Setup tab shows an instance selector; picking an instance resolves
  the addon's logical secretId against THAT instance's overrides.

  The @pikku/addon-mailgun fixture is wired twice: "mailgun" (no overrides, so it
  reads the addon's own MAILGUN_CREDENTIALS) and "mailgun-promo" (remaps
  MAILGUN_CREDENTIALS -> MAILGUN_PROMO_CREDENTIALS).

  Background:
    Given the API is available
    And I sign in to the console as the seeded "admin" user

  Scenario: The Setup tab resolves the secret against the selected instance
    When I open the setup for the "@pikku/addon-mailgun" addon
    Then the addon instance selector should be shown
    When I select the addon instance "mailgun"
    Then the secret "Mailgun API" resolves to "MAILGUN_CREDENTIALS"
    When I select the addon instance "mailgun-promo"
    Then the secret "Mailgun API" resolves to "MAILGUN_PROMO_CREDENTIALS"

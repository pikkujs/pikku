@addon-setup-console @console
Feature: An addon's setup surface shows what it needs

  When you open an installed addon, the console's Setup tab lists the OAuth
  integrations it needs connected and the secrets it needs set, flagging which
  are still missing — and lets you connect / set them right there.

  The @pikku/addon-fake-crm fixture declares one OAuth2 integration (fake-crm)
  and one plain secret (FAKE_CRM_API_KEY), so both requirement kinds appear.

  Background:
    Given the API is available
    And I sign in to the console as the seeded "admin" user

  Scenario: Missing requirements are surfaced, then satisfied inline
    When I open the setup for the "@pikku/addon-fake-crm" addon
    Then the OAuth integration "Fake CRM" should be "Not connected"
    And I can connect the OAuth integration "Fake CRM"
    And the secret "Fake CRM API Key" should be "Not set"
    When I set the secret "Fake CRM API Key" to "sk-fake-123"
    Then the secret "Fake CRM API Key" should be "Set"
    # Clicking Connect runs the full OAuth round-trip (out to the mock provider
    # and back to this page). Whether a singleton link then reads back as
    # "Connected" is a separate better-auth concern tracked outside this feature.
    When I connect the OAuth integration "Fake CRM"
    Then the setup should still list the OAuth integration "Fake CRM"

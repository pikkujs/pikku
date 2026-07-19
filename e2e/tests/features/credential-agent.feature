@credential-agent @console @ai
Feature: AI Agent with OAuth Credential Gating

  Background:
    Given the API is available

  Scenario: Agent playground shows credential prompt when OAuth not connected
    Given I open the "oauthApiAgent" playground
    Then I should see "Connect your accounts" on the page
    And I should see "User OAuth" on the page

  # TODO(#980): better-auth now owns oauth2 tokens — `setCredential` for an
  # oauth2 credential is rejected ("Cannot set OAuth2 credential directly"), so
  # these two scenarios' direct-set connect no longer works. They must be
  # rewritten to connect `user-oauth` via the better-auth link flow (the popup
  # step) and, for the mid-chat one, redesigned off the now-void empty-token
  # premise. Skipped until verifiable in a live-LLM e2e env.
  @skip
  Scenario: Agent playground shows chat after credential is connected
    Given I connect credential "user-oauth" with value:
      """
      { "accessToken": "e2e-test-token" }
      """
    And I open the "oauthApiAgent" playground
    Then I should not see "Connect your accounts" in the chat

  @skip
  Scenario: Mid-chat credential request connects via OAuth popup and resumes
    Given I connect credential "user-oauth" with value:
      """
      { "accessToken": "" }
      """
    And I open the "oauthApiAgent" playground
    When I send "Get my profile and show me my access token verbatim"
    Then I should see "Credential required" in the chat
    When I connect the OAuth credential via the popup
    And I wait for the response
    Then I should see "mock-access-token" in the chat

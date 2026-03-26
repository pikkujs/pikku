@credential-agent @console @ai
Feature: AI Agent with OAuth Credential Gating

  Background:
    Given the API is available

  Scenario: Agent shows credential required prompt when user has no OAuth credential
    Given I open the "oauthApiAgent" playground
    When I send "Check my profile"
    And I wait for the response
    Then I should see "credential required" in the chat
    And I should see "user-oauth" in the chat

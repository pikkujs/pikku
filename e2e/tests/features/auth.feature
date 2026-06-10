@auth
Feature: Auth.js Credentials Authentication

  Background:
    Given the API is available
    And auth users are reset

  Scenario: User signs up successfully
    When I sign up as "alice@example.com" with password "password123"
    Then the signup should succeed
    And the user "alice@example.com" should exist

  Scenario: Duplicate signup is rejected
    When I sign up as "bob@example.com" with password "password123"
    Then the signup should succeed
    When I sign up as "bob@example.com" with password "other"
    Then the signup should fail with "CredentialsSignin"

  Scenario: User logs in with valid credentials
    Given I have signed up as "carol@example.com" with password "secret99"
    When I log in as "carol@example.com" with password "secret99"
    Then I should be logged in as "carol@example.com"

  Scenario: Login fails with wrong password
    Given I have signed up as "dave@example.com" with password "correct"
    When I log in as "dave@example.com" with password "wrong"
    Then I should not be logged in

  Scenario: Login fails for unknown user
    When I log in as "ghost@example.com" with password "anything"
    Then I should not be logged in

  Scenario: User logs out
    Given I have signed up as "eve@example.com" with password "mypassword"
    And I am logged in as "eve@example.com" with password "mypassword"
    When I log out
    Then I should be logged out

  Scenario: Session persists between requests
    Given I have signed up as "frank@example.com" with password "sessionpass"
    And I am logged in as "frank@example.com" with password "sessionpass"
    When I fetch my session
    Then the session email should be "frank@example.com"

  Scenario: Session is cleared after logout
    Given I have signed up as "grace@example.com" with password "logouttest"
    And I am logged in as "grace@example.com" with password "logouttest"
    When I log out
    And I fetch my session
    Then the session should be empty

@user-admin-console @console
Feature: Managing users from the console

  The console's Users page drives the scaffolded `admin:users:*` functions —
  the same ones a host app calls directly. Nothing about user management lives
  in the console addon, so this exercises the host's own scaffold through a
  browser.

  Every action is gated on its own scope, and the UI shows only what the signed-in
  caller may actually do: a caller without `admin:users:create` gets no way to
  add one, rather than a button that fails.

  Background:
    Given the API is available

  # One scenario, because the lifecycle is inherently sequential — you cannot ban
  # a user you have not created, or verify a delete without one to delete.
  Scenario: The full lifecycle of a user, driven from the console
    When I open the users page in the console
    And I add the user "lifecycle@e2e.test" with the password "lifecycle-pass"
    Then I should see the user "lifecycle@e2e.test" in the directory
    And "lifecycle@e2e.test" should be able to sign in

    When I ban the user "lifecycle@e2e.test" from the console
    Then the user "lifecycle@e2e.test" should be shown as banned
    And "lifecycle@e2e.test" should not be able to sign in

    When I unban the user "lifecycle@e2e.test" from the console
    Then the user "lifecycle@e2e.test" should be shown as active
    And "lifecycle@e2e.test" should be able to sign in

    When I sign the user "lifecycle@e2e.test" out everywhere from the console
    Then the user "lifecycle@e2e.test" should be shown as active

    When I set the password of "lifecycle@e2e.test" to "lifecycle-rotated" from the console
    Then "lifecycle@e2e.test" should be able to sign in with the password "lifecycle-rotated"

    When I delete the user "lifecycle@e2e.test" from the console
    Then I should not see the user "lifecycle@e2e.test" in the directory

  # There is deliberately no scenario here for a caller holding only some of the
  # `admin:users:*` scopes, even though the create button and the actions menu
  # are rendered from exactly that. The console gates entry on the umbrella
  # `admin` scope, which parent-grants every leaf — so a partially-scoped caller
  # never reaches the page to be observed. That separation is covered where it
  # is observable, over RPC, in user-admin.feature.

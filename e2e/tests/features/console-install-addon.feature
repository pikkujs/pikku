@console-install-addon @console
Feature: Installing addons from the console

  Installing an addon from the console adds its package and writes a
  `<name>.addon.ts` wiring, so the same package can be wired under a name you
  choose. Re-using a name that is already wired must surface as a clean, inline
  error — never a raw 500 — and a fresh install lands you on the addon's setup.

  The fixture project already wires "gmail" (@pikku/addon-gmail), so it is the
  name to collide with. @pikku/addon-mandrill and @pikku/addon-email-send are in
  the catalogue but NOT wired, so their cards open the install drawer.

  Background:
    Given the API is available
    And I sign in to the console as the seeded "admin" user

  Scenario: Re-using an installed name shows a clean conflict, not a 500
    When I open the browse drawer for the "@pikku/addon-email-send" addon
    And I set the install instance name to "gmail"
    And I click add to project
    Then the install error should contain "already installed under the name"

  Scenario: An invalid instance name blocks install before it reaches the server
    When I open the browse drawer for the "@pikku/addon-email-send" addon
    And I set the install instance name to "Not A Namespace!"
    Then the add to project button should be disabled

  # TODO: This mutates the fixture and triggers a `pikku dev` reinspection. The
  # dev server keeps the freshly-installed addon loaded in-memory after the
  # After hook deletes the wiring (reload lag on removal), so a re-run finds the
  # package already "installed" and its card opens Setup instead of the drawer —
  # non-deterministic against a persistent dev server. Runs green against a fresh
  # server (CI). Un-skip once the harness gives each mutating scenario a clean
  # server, or the console exposes multi-instance add from an installed card.
  @mutates-project @skip
  Scenario: Installing an addon under a fresh name lands on its setup
    When I open the browse drawer for the "@pikku/addon-mandrill" addon
    And I set the install instance name to "mandrill-e2e"
    And I click add to project
    Then I should land on the setup for "@pikku/addon-mandrill"

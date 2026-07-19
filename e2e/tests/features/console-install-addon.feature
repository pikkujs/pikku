@console-install-addon @console
Feature: Installing addons from the console

  Installing an addon from the console adds its package and writes a
  `<name>.addon.ts` wiring, so the same package can be wired under a name you
  choose. Re-using a name that is already wired must surface as a clean, inline
  error — never a raw 500 — and a fresh install lands you on the addon's setup.

  The fixture project already wires "mailgun" (@pikku/addon-mailgun), so it is
  the name to collide with. @pikku/addon-mandrill and @pikku/addon-email-send are
  in the catalogue but NOT wired, so their cards open the install drawer.

  Background:
    Given the API is available
    And I sign in to the console as the seeded "admin" user

  Scenario: Re-using an installed name shows a clean conflict, not a 500
    When I open the browse drawer for the "@pikku/addon-email-send" addon
    And I set the install instance name to "mailgun"
    And I click add to project
    Then the install error should contain "already installed under the name"

  Scenario: An invalid instance name blocks install before it reaches the server
    When I open the browse drawer for the "@pikku/addon-email-send" addon
    And I set the install instance name to "Not A Namespace!"
    Then the add to project button should be disabled

  # TODO: This mutates the fixture and triggers a `pikku dev` reinspection.
  # The REMOVAL side is now fixed: `pikku dev` reconciles the in-memory addon
  # registry on delete (reconcileAddonRegistry prunes the unwired package —
  # proven live: "• Removed unwired addon "<name>""), so the After hook's
  # cleanup no longer leaves a stale in-memory addon that makes re-runs racy.
  # But the FORWARD install->setup path still fails against a persistent dev
  # server: after "Add to project" writes the wiring, PackageDetailPage polls
  # console:getAddonInstalledPackage for only ~20s (pollExpired) before
  # rendering "Package not found". Re-inspection + installed-package registry
  # population takes longer than that window here (full regen observed 6-10s+),
  # so the Setup tab never appears. Un-skip once (a) the console poll window
  # covers the actual re-inspection time / getAddonInstalledPackage returns the
  # freshly-wired addon promptly, or (b) the harness gives each mutating
  # scenario a fast fresh server. Runs green against a fresh server (CI).
  @mutates-project @skip
  Scenario: Installing an addon under a fresh name lands on its setup
    When I open the browse drawer for the "@pikku/addon-mandrill" addon
    And I set the install instance name to "mandrill-e2e"
    And I click add to project
    Then I should land on the setup for "@pikku/addon-mandrill"

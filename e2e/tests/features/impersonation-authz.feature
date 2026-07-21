@impersonation
Feature: Impersonation is gated on the admin:impersonate scope

  The impersonation header is honoured only for a caller whose resolved scopes
  satisfy `admin:impersonate`. There is no `role === 'admin'` fallback and no
  self-service escalation: an unauthorized caller sending the same header is
  silently ignored and keeps running as themselves, so a forged header can
  never widen access.

  `whoAmI` echoes the session the request actually ran under, which is what
  makes the difference observable without a browser.

  Background:
    Given the API is available

  Scenario: A caller holding the scope runs as the target
    When "admin@e2e.test" calls "whoAmI" impersonating "guest@e2e.test"
    Then the impersonated response should run as "guest@e2e.test"

  Scenario: A caller without the scope cannot escalate by forging the header
    When "guest@e2e.test" calls "whoAmI" impersonating "admin@e2e.test"
    Then the impersonated response should run as "guest@e2e.test"

  # The scope itself is the gate, not the identity: granting it to the guest
  # opens impersonation on the next request and revoking it closes it again,
  # leaving the guest back in its seeded state.
  Scenario: Granting admin:impersonate opens the gate, revoking it closes it
    When "guest@e2e.test" calls "whoAmI" impersonating "admin@e2e.test"
    Then the impersonated response should run as "guest@e2e.test"
    When the scope "admin:impersonate" is granted directly to "guest@e2e.test"
    And "guest@e2e.test" calls "whoAmI" impersonating "admin@e2e.test"
    Then the impersonated response should run as "admin@e2e.test"
    When the direct scope "admin:impersonate" is revoked from "guest@e2e.test"
    And "guest@e2e.test" calls "whoAmI" impersonating "admin@e2e.test"
    Then the impersonated response should run as "guest@e2e.test"

@agent-protocol @agent-ownership
Feature: Ownership of an agent's threads

  A thread belongs to the session that created it. The four thread-management
  RPCs (getAgentThreadMessages, getAgentThreadRuns, deleteAgentThread and the
  listing getAgentThreads) are keyed by a caller-supplied threadId, so they must
  derive the owner from the session and refuse anyone else — a caller cannot read
  or delete another principal's conversation just by knowing its id.

  Two properties are load-bearing and asserted separately:

  - The refusal is a ForbiddenError that does NOT echo the threadId back. Quoting
    the id would confirm the thread exists, turning the guard into an existence
    oracle.
  - The owner is the session principal, not the caller-supplied resourceId. A
    caller who forges the resourceId of the real owner is still refused, because
    the principal prefix it cannot mint is what the check compares.

  Background:
    Given user "alice" runs agent "todoReadAgent" on thread "alices-thread" with script "text-only"

  Scenario: The owner can read her own thread messages
    Then user "alice" calling "getAgentThreadMessages" on thread "alices-thread" succeeds

  Scenario: A foreign caller cannot read the thread's messages
    Then user "mallory" calling "getAgentThreadMessages" on thread "alices-thread" is refused

  Scenario: A foreign caller cannot read the thread's runs
    Then user "mallory" calling "getAgentThreadRuns" on thread "alices-thread" is refused

  Scenario: A foreign caller cannot delete the thread
    Then user "mallory" calling "deleteAgentThread" on thread "alices-thread" is refused
    And user "alice" calling "getAgentThreadMessages" on thread "alices-thread" succeeds

  Scenario: A forged resourceId does not let a foreign caller in
    Then user "mallory" claiming resource "agent-security" on thread "alices-thread" is refused

  Scenario: The owner sees her thread when listing, a foreign caller does not
    Then user "alice" listing threads sees thread "alices-thread"
    And user "mallory" listing threads does not see thread "alices-thread"

  Scenario: An org-scoped agent refuses a caller with no organization
    When I run agent "orgScopeAgent" with no organization and script "text-only" and message "let me in without an org"
    Then the agent run is refused

  Scenario: An org-scoped agent runs for a caller that has an organization
    When I run agent "orgScopeAgent" as org "acme" with script "text-only" and message "i have an org"
    Then the agent run succeeds

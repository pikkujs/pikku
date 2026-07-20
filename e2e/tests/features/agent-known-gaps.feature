@agent-protocol @agent-known-gap
Feature: Current agent behaviour that is a known gap

  These scenarios pin behaviour that is arguably wrong, so that any change to it
  is loud rather than silent. They are not endorsements — each is a place the
  loop swallows a condition a caller might reasonably expect to surface.

  Scenario: maxSteps exhaustion ends the loop with no signal
    # budgetAgent has maxSteps:1. The script calls a tool on step 1 and would
    # answer on step 2, but the budget is spent first — so the run ends after the
    # tool call with an empty result and no flag or event saying it was truncated.
    When I run agent "budgetAgent" as user "alice" with script "open-tool-then-text" and message "budget"
    Then the agent run succeeds
    And the run result is ""
    And the run reports 1 model call

  Scenario: prepareStep stop() ends the run with no signal
    # prepareStopAgent calls stop() before the first step. The loop breaks before
    # any model call, and the run still reports success with an empty result —
    # nothing distinguishes it from an agent that genuinely had nothing to say.
    When I run agent "prepareStopAgent" as user "alice" with script "text-only" and message "stop me"
    Then the agent run succeeds
    And the run result is ""
    And the run reports 0 model calls

  Scenario: An unresolvable tool is dropped silently rather than suspending
    # missingRpcAgent lists a tool whose RPC does not exist. Rather than suspending
    # the run with the missing name before any model call, the tool is simply
    # omitted from the offered list and the run proceeds as if it were never asked
    # for.
    When I run agent "missingRpcAgent" as user "alice" with script "text-only" and message "resolve me"
    Then the agent run succeeds
    And model call 1 was offered no tools
    And the run reports 1 model call

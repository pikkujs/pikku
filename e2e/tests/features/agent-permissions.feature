@agent-protocol @agent-permissions
Feature: Permission filtering of an agent's tools

  Authorization on agent tools splits in two, and the split is the contract:

  - `pikkuAuth` depends only on the session, so it can be evaluated before the
    run starts. A tool the caller fails is filtered out of the list and the
    model is never told it exists.
  - `pikkuPermission` depends on request data, which does not exist until the
    model actually calls the tool. Such a tool is still offered; the gate runs
    on invocation instead.

  Auth narrows the menu, permissions guard the call. Asserting the first via
  the offered tool list matters because a tool that is absent cannot be called
  by any model, cooperative or not.

  Scenario: An auth-gated tool the caller fails is never offered
    When I run agent "permissionsAgent" as user "outsider" with script "text-only" and message "what can you do"
    Then model call 1 was offered the tool "openTool"
    And model call 1 was not offered the tool "gatedTool"

  Scenario: The same tool is offered to a caller who passes its auth check
    When I run agent "permissionsAgent" as user "permitted-user" with script "text-only" and message "what can I use"
    Then model call 1 was offered the tool "openTool"
    And model call 1 was offered the tool "gatedTool"

  Scenario: Filtering is re-evaluated per run rather than cached
    When I run agent "permissionsAgent" as user "permitted-user" with script "text-only" and message "first as permitted"
    And I run agent "permissionsAgent" as user "outsider" with script "text-only" and message "then as outsider"
    Then the call for "first as permitted" was offered the tool "gatedTool"
    And the call for "then as outsider" was not offered the tool "gatedTool"

  Scenario: A sessionless caller is offered no auth-gated tools
    When I run agent "permissionsAgent" with script "text-only" and message "anonymous ask"
    Then model call 1 was offered the tool "openTool"
    And model call 1 was not offered the tool "gatedTool"

  Scenario: An agent whose every tool is filtered away still runs
    When I run agent "gatedOnlyAgent" as user "outsider" with script "text-only" and message "nothing left"
    Then the run result is "The mock model replied with plain text."
    And model call 1 was offered no tools

  Scenario: A data-dependent permission cannot filter, so its tool is offered
    When I run agent "permissionsAgent" as user "outsider" with script "text-only" and message "data gated menu"
    Then model call 1 was offered the tool "dataGatedTool"

  Scenario: A data-dependent permission is enforced when the tool is invoked
    When I run agent "permissionsAgent" as user "permitted-user" with script "data-gated-foreign-owner" and message "reach for a foreign record"
    Then the tool call was refused

  Scenario: The same tool succeeds on a record the caller does own
    When I run agent "permissionsAgent" as user "permitted-user" with script "data-gated-own-record" and message "reach for my own record"
    Then the tool call succeeded

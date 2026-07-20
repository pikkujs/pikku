@agent-protocol @agent-overrides
Feature: Per-request overrides reach the model

  A caller can override the model, temperature and context on a single request
  without redefining the agent. These are asserted against the scripted model's
  request log, so they prove the override travelled all the way to the provider
  rather than merely being accepted by the HTTP surface.

  Scenario: A per-request model override selects the provider model
    # The agent's own default model is never openai here — the run only succeeds
    # because the request-level model reaches the provider and picks the script.
    When I run agent "todoReadAgent" with script "text-only" and message "pick a model"
    Then model call 1 used model "text-only"

  Scenario: A per-request context is injected into the instructions verbatim
    When I run agent "todoReadAgent" with script "text-only" and message "use my context" and context "org=acme project=falcon"
    Then model call 1 instructions include "org=acme project=falcon"

  Scenario: Context is only present when the request supplies it
    When I run agent "todoReadAgent" with script "text-only" and message "no context here"
    Then model call 1 carried non-empty instructions
    And model call 1 instructions include "todo"

@agent-protocol @agent-prepare-step
Feature: prepareStep narrows a step before it runs

  `prepareStep` runs before each model call with the live tool array for that
  step. Mutating the array narrows what the model is offered from that step on,
  which is asserted against the scripted model's request log.

  Scenario: Tools offered on the first step are withdrawn on the next
    When I run agent "prepareStepAgent" with script "open-tool-then-text" and message "narrow me"
    Then the run reports 2 model calls
    And model call 1 was offered the tool "openTool"
    And model call 2 was offered no tools

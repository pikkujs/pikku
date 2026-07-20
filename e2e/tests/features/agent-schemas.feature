@agent-protocol @agent-schemas
Feature: An output schema produces a structured result

  When an agent declares an `output` schema and offers no tools, the runner
  asks the model for a structured object and surfaces it as the run result
  (`result.object ?? result.text`), rather than the plain assistant text.

  Scenario: A tool-free agent with an output schema returns the parsed object
    When I run agent "structuredAgent" with script "structured-object" and message "classify this"
    Then the run result is a structured object
    And the run result field "sentiment" is the text "positive"
    And the run result field "summary" is the text "all good"
    And the run result field "score" is the number 0.9

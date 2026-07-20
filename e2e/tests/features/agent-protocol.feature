@agent-protocol
Feature: AI agent run and stream protocol

  The agent surface is exercised against a scripted model rather than a real
  one, so these assertions are about Pikku's own behaviour — the tool loop, the
  event ordering, what is offered to the model — and not about whether an LLM
  happens to cooperate. The script is chosen per request via the model override
  (`mock/<script>`), which keeps scenarios independent of each other.

  Scenario: A single-step agent returns the scripted reply
    When I run agent "todoReadAgent" with script "text-only" and message "hello"
    Then the run result is "The mock model replied with plain text."
    And the run reports 1 model call

  Scenario: The agent loop runs a tool and then answers
    When I run agent "todoReadAgent" with script "tool-then-text" and message "check my todos"
    Then the run result is "I checked your todos."
    And the run reports 2 model calls
    And model call 1 was offered the tool "todos__listTodos"
    And model call 2 received the result of the tool call

  Scenario: Each model call is one agent step
    When I run agent "todoReadAgent" with script "two-tools-then-text" and message "check twice"
    Then the run reports 3 model calls
    And the model calls have step indexes 0, 1, 2

  Scenario: The agent's own tools are offered to the model
    When I run agent "todoReadAgent" with script "text-only" and message "what can you do"
    Then model call 1 was offered the tool "todos__listTodos"
    And model call 1 was offered the tool "todos__deleteTodo"
    And every offered tool has an input schema

  Scenario: Instructions are built from the agent definition
    When I run agent "todoReadAgent" with script "text-only" and message "hi"
    Then model call 1 carried non-empty instructions

  Scenario: A per-request temperature reaches the model
    When I run agent "todoReadAgent" with script "text-only" and message "hi" at temperature 0.3
    Then model call 1 used temperature 0.3

  Scenario: Streaming emits a well-formed run envelope
    When I stream agent "todoReadAgent" with script "text-only" and message "stream hello"
    Then the stream starts with "RUN_STARTED" and ends with "RUN_FINISHED"
    And the stream contains "TEXT_MESSAGE_CONTENT"

  Scenario: Streamed text matches the synchronous result
    When I run agent "todoReadAgent" with script "text-only" and message "same both ways"
    And I stream agent "todoReadAgent" with script "text-only" and message "same both ways"
    Then the streamed text matches the run result

  Scenario: A streamed tool call is bracketed and precedes its result
    When I stream agent "todoReadAgent" with script "tool-then-text" and message "stream a tool"
    Then "TOOL_CALL_START" precedes "TOOL_CALL_RESULT" in the stream
    And "TOOL_CALL_END" precedes "TOOL_CALL_RESULT" in the stream
    And the tool call and its result share a toolCallId

  Scenario: One step envelope is emitted per model call
    When I stream agent "todoReadAgent" with script "tool-then-text" and message "count the steps"
    Then the stream contains 2 "STEP_STARTED" events
    And the stream contains 2 "STEP_FINISHED" events

  Scenario: The run reports token usage
    When I stream agent "todoReadAgent" with script "text-only" and message "usage please"
    Then the finished run reports non-zero token usage

  Scenario: An unknown agent is refused
    When I run agent "noSuchAgent" with script "text-only" and message "hello"
    Then the agent call fails
    And no model call is made

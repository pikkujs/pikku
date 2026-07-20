@agent-protocol @agent-memory
Feature: Thread memory persists and replays

  A thread is the unit of memory: successive runs on the same thread accumulate
  history that is replayed into later model calls, and both the messages and the
  runs are persisted so the owner can read them back. These assertions are about
  storage and replay — the merge/trim semantics are unit-tested separately.

  Scenario: A later turn replays the earlier turn's history to the model
    When I run agent "todoReadAgent" as user "alice" with script "text-only" and message "remember the sky is blue"
    And I run agent "todoReadAgent" as user "alice" with script "text-only" and message "what did I tell you"
    Then the model call for "what did I tell you" replays the earlier message "remember the sky is blue"

  Scenario: A run's messages and run history are persisted for the owner
    When I run agent "todoReadAgent" as user "alice" with script "tool-then-text" and message "persist this turn"
    Then user "alice" reading the thread sees a message containing "persist this turn"
    And user "alice" reading the thread sees a "tool" message
    And user "alice" reading the thread runs sees 1 run

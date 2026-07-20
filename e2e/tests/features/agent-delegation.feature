@agent-protocol @agent-delegation
Feature: An agent delegates to a sub-agent

  A parent agent lists another agent under `agents`, which the framework
  exposes to the model as a tool. Calling that tool runs the sub-agent under
  its OWN configured model (not the caller's per-request override), so a
  fixture sub-agent on `mock/sub-agent-text` behaves deterministically. In the
  default `delegate` mode the sub-agent's own text streams to the client; in
  `supervise` mode the sub-agent's text is suppressed and only the parent's
  summarising reply is streamed. These protocol checks replace the
  browser-driven router/supervise console scenarios.

  Scenario: Delegating runs the sub-agent's own model, not the caller's override
    When I run agent "delegateParentAgent" with script "delegate-then-text" and message "delegate please"
    Then the sub-agent model "sub-agent-text" was invoked with message "handle the task"
    And the run reports 2 model calls

  Scenario: In delegate mode the sub-agent's text reaches the client stream
    When I stream agent "delegateParentAgent" with script "delegate-then-text" and message "delegate please"
    Then the streamed text contains "SUBAGENT-REPLY"
    And the streamed text does not contain "SUPERVISOR"

  Scenario: In supervise mode the sub-agent's text is suppressed
    When I stream agent "superviseParentAgent" with script "delegate-then-text" and message "supervise please"
    Then the streamed text does not contain "SUBAGENT-REPLY"
    And the streamed text contains "SUPERVISOR"

@ai @converse
Feature: Actor converses with the todo agent
  An actor agent (the "shopper" persona) holds a real, LLM-driven conversation
  with the todo-agent over HTTP — approving its tool requests in-persona. We
  assert both the actor's own verdict and that the todo actually landed in the
  store (a deterministic check the caller owns).

  Scenario: Shopper gets a todo created and the store confirms it
    Given the todo list is reset
    When the "shopper" actor asks the "todo-agent" to add a todo titled "Book the venue"
    Then the actor should conclude the task succeeded
    And the todo list should contain "Book the venue"

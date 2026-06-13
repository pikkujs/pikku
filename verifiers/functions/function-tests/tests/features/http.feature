Feature: HTTP functions

  Scenario: welcomeToPikku returns a greeting
    When "anonymous" calls "welcomeToPikku"
    Then the call succeeds

  Scenario: helloWorld returns a greeting
    When "anonymous" calls "helloWorld"
    Then the call succeeds

Feature: Workflow Step Functions

  Scenario: Double a numeric value
    When an anonymous user calls "doubleValue" with:
      | value | 5 |
    Then the result "result" is "10"

  Scenario: Format a greeting message
    When an anonymous user calls "formatMessage" with:
      | greeting | Hello |
      | name     | World |
    Then the result "message" is "Hello, World!"

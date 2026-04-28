@changes-console @console
Feature: Changes Console UI

  The /changes page diffs two `.pikku/` directories ("base" and "ours") and
  renders structural changes per category. The base path is supplied via a
  query parameter so tests can pin both sides to fixtures.

  Background:
    Given the API is available

  Scenario: Diff shows added function and added HTTP wiring
    When I open the changes page comparing "state-diff/ours" against "state-diff/base"
    Then the Functions tab shows 1 added entry
    And the Functions tab shows 1 modified entry
    And the changes list contains "newFunc"
    And the changes list contains "modifiedFunc"
    When I switch to the HTTP tab
    Then the HTTP tab shows 1 added entry
    And the changes list contains "/new"

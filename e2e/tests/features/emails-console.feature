@emails-console @console
Feature: Emails Console Page

  Background:
    Given the API is available

  Scenario: Emails page renders the template grid
    When I navigate to the emails page
    Then I should see "Emails" on the page
    And I should see "hello-world" on the page

  Scenario: Email template card shows locale count
    When I navigate to the emails page
    Then I should see "2 locales" on the page

  Scenario: Clicking a template opens the detail view
    When I navigate to the emails page
    And I click the "hello-world" email template card
    Then I should see "hello-world" on the page
    And I should see "Render" on the page

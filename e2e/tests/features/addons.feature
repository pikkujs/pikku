@addons @console @flaky
Feature: Addons Page

  Background:
    Given the API is available

  Scenario: Installed addons are visible on the addons page
    When I navigate to the addons page
    Then I should see the installed addons list
    And I should see addon "console" with package "@pikku/addon-console"
    And I should see addon "todos" with package "@pikku/addon-todos"
    And I should see addon "emails" with package "@pikku/addon-emails"

  Scenario: Community addons are visible on the community tab
    When I navigate to the addons page
    And I click the "Community" tab
    Then I should see the community addons list
    And I should see community package "@pikku/addon-stripe"

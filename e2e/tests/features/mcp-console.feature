@mcp-console @console
Feature: MCP Console UI

  Background:
    Given the API is available

  Scenario: MCP tool without description shows warning in console
    When I open the MCP tab in the console
    Then I should see MCP tool "mcpToolWithDescription" without a warning
    And I should see MCP tool "mcpToolWithoutDescription" with a missing description warning

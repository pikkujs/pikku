@credential
Feature: Credential Service API

  Background:
    Given the API is available
    And credentials are reset

  # --- Basic CRUD ---

  Scenario: Set and get a global credential
    When I set credential "stripe" with value:
      """
      { "apiKey": "sk_test_123" }
      """
    Then credential "stripe" should exist
    And credential "stripe" should have value:
      """
      { "apiKey": "sk_test_123" }
      """

  Scenario: Get missing credential returns null
    Then credential "nonexistent" should not exist
    And credential "nonexistent" value should be null

  Scenario: Delete a credential
    When I set credential "temp" with value:
      """
      { "token": "abc" }
      """
    Then credential "temp" should exist
    When I delete credential "temp"
    Then credential "temp" should not exist

  Scenario: Overwrite an existing credential
    When I set credential "api" with value:
      """
      { "key": "old" }
      """
    And I set credential "api" with value:
      """
      { "key": "new" }
      """
    Then credential "api" should have value:
      """
      { "key": "new" }
      """

  # --- Per-user isolation ---

  Scenario: Per-user credential isolation
    When I set credential "google" for user "user-1" with value:
      """
      { "accessToken": "token-1" }
      """
    And I set credential "google" for user "user-2" with value:
      """
      { "accessToken": "token-2" }
      """
    Then credential "google" for user "user-1" should have value:
      """
      { "accessToken": "token-1" }
      """
    And credential "google" for user "user-2" should have value:
      """
      { "accessToken": "token-2" }
      """
    And credential "google" should not exist

  Scenario: Per-user delete does not affect other users
    When I set credential "slack" for user "user-a" with value:
      """
      { "token": "a" }
      """
    And I set credential "slack" for user "user-b" with value:
      """
      { "token": "b" }
      """
    When I delete credential "slack" for user "user-a"
    Then credential "slack" for user "user-a" should not exist
    And credential "slack" for user "user-b" should exist

  Scenario: Global vs per-user credentials are independent
    When I set credential "github" with value:
      """
      { "token": "global" }
      """
    And I set credential "github" for user "user-1" with value:
      """
      { "token": "per-user" }
      """
    Then credential "github" should have value:
      """
      { "token": "global" }
      """
    And credential "github" for user "user-1" should have value:
      """
      { "token": "per-user" }
      """

  Scenario: Get all credentials for a user
    When I set credential "stripe" for user "user-x" with value:
      """
      { "apiKey": "sk_123" }
      """
    And I set credential "google" for user "user-x" with value:
      """
      { "accessToken": "ya29" }
      """
    Then user "user-x" should have 2 credentials
    And user "user-x" credential "stripe" should be:
      """
      { "apiKey": "sk_123" }
      """
    And user "user-x" credential "google" should be:
      """
      { "accessToken": "ya29" }
      """

  Scenario: Get all credentials for user with none returns empty
    Then user "empty-user" should have 0 credentials

  # --- HMAC signing addon (full wire credential flow) ---

  Scenario: HMAC sign and verify with wire credential
    When I set credential "hmac-key" with value:
      """
      { "secretKey": "my-secret-key-123" }
      """
    And I sign "hello world" with credential "hmac-key"
    Then the signature should not be empty
    When I verify "hello world" with the signature and credential "hmac-key"
    Then the verification should be valid

  Scenario: HMAC verify rejects wrong signature
    When I set credential "hmac-key" with value:
      """
      { "secretKey": "my-secret-key-123" }
      """
    When I verify "hello world" with signature "wrong-sig" and credential "hmac-key"
    Then the verification should be invalid

  Scenario: HMAC sign fails without credential
    When I sign "hello world" without credentials
    Then the sign request should fail with "Missing hmac-key credential"

  # --- Lazy credential loading (via session userId, no x-credentials header) ---

  Scenario: Lazy-load credentials for authenticated user
    When I set credential "hmac-key" for user "lazy-user" with value:
      """
      { "secretKey": "lazy-secret-123" }
      """
    And I sign "hello lazy" as user "lazy-user"
    Then the signature should not be empty
    When I verify "hello lazy" with the signature as user "lazy-user"
    Then the verification should be valid

  Scenario: Lazy-load returns different credentials per user
    When I set credential "hmac-key" for user "user-a" with value:
      """
      { "secretKey": "secret-a" }
      """
    And I set credential "hmac-key" for user "user-b" with value:
      """
      { "secretKey": "secret-b" }
      """
    And I sign "same message" as user "user-a"
    And I save the signature as "sig-a"
    And I sign "same message" as user "user-b"
    Then the signature should differ from "sig-a"

  Scenario: Lazy-load fails gracefully without credentials
    When I sign "hello" as user "no-creds-user"
    Then the sign request should fail with "Missing hmac-key credential"

  Scenario: Lazy-load cross-verify fails between users
    When I set credential "hmac-key" for user "user-x" with value:
      """
      { "secretKey": "secret-x" }
      """
    And I set credential "hmac-key" for user "user-y" with value:
      """
      { "secretKey": "secret-y" }
      """
    And I sign "cross-verify test" as user "user-x"
    When I verify "cross-verify test" with the signature as user "user-y"
    Then the verification should be invalid

  # --- OAuth API addon (per-user OAuth credential gating) ---

  Scenario: OAuth API returns 403 without credentials
    When I call the OAuth API profile as user "no-creds-user"
    Then the OAuth API response status should be 403

  Scenario: OAuth API returns 200 after OAuth connect
    Given the mock OAuth server is running
    When user "oauth-alice" initiates OAuth connect for "user-oauth"
    And the OAuth callback is completed for "user-oauth"
    And I call the OAuth API profile as user "oauth-alice"
    Then the OAuth API response status should be 200
    And the OAuth API profile should be authenticated

  Scenario: OAuth API per-user isolation - one connected, one not
    Given the mock OAuth server is running
    When user "connected-user" initiates OAuth connect for "user-oauth"
    And the OAuth callback is completed for "user-oauth"
    When I call the OAuth API profile as user "connected-user"
    Then the OAuth API response status should be 200
    When I call the OAuth API profile as user "disconnected-user"
    Then the OAuth API response status should be 403

  # --- Explicit header loading ---

  Scenario: Different signing keys produce different signatures
    When I set credential "hmac-key" with value:
      """
      { "secretKey": "key-alpha" }
      """
    And I sign "test message" with credential "hmac-key"
    And I save the signature as "sig-alpha"
    And credentials are reset
    When I set credential "hmac-key" with value:
      """
      { "secretKey": "key-beta" }
      """
    And I sign "test message" with credential "hmac-key"
    Then the signature should differ from "sig-alpha"

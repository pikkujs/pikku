@agent-protocol @agent-attachments
Feature: Attachments reach the model as content parts

  A request can carry image or file attachments alongside its text. They are
  turned into content parts on the user message and handed to the model, which
  is visible in the scripted model's request log.

  Scenario: An image attachment reaches the model as a non-text part
    When I run agent "todoReadAgent" with script "text-only" and message "look at this image" and an image attachment
    Then the model call for "look at this image" carries a non-text content part
    And the model call for "look at this image" carries an attachment with media type "image/png"

  Scenario: A file attachment preserves its media type
    When I run agent "todoReadAgent" with script "text-only" and message "read this file" and a file attachment named "report.pdf"
    Then the model call for "read this file" carries a non-text content part
    And the model call for "read this file" carries an attachment with media type "application/pdf"

@agent-protocol @agent-voice
Feature: Voice input is transcribed before reaching the model

  An audio attachment on the user message is transcribed by the voiceInput
  middleware and replaced, in place, with its text before the model is called.
  The scripted transcription model returns a fixed transcript, so a scenario can
  assert the spoken words reached the model without controlling the audio bytes.

  Scenario: An audio attachment is transcribed and the text reaches the model
    When I run agent "voiceInputAgent" with script "text-only" and message "listen" and an audio attachment
    Then a model call was made whose messages include the transcript "the transcribed spoken words"
    And no model call carries an audio content part

  Scenario: Voice input without a transcription model fails the run
    When I run agent "voiceInputNoModelAgent" with script "text-only" and message "listen" and an audio attachment
    Then the run failed

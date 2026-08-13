export { detectSilence } from './silence-detector.js'
export type {
  SilenceDetectorControl,
  SilenceDetectorHandlers,
} from './silence-detector.js'
export type {
  SpeechDetectorHandlers,
  SpeechDetectorOptions,
} from './speech-detector.js'

export { VoiceSession } from './voice-session.js'

export { AudioPlaybackQueue } from './audio-playback-queue.js'

export {
  spokenApproval,
  interpretConsent,
} from './spoken-approval.js'
export type {
  Consent,
  PendingApproval,
  SpokenApproval,
  SpokenApprovalOptions,
} from './spoken-approval.js'

export { useVoiceConversation } from './use-voice-conversation.js'
export type {
  VoiceConversation,
  VoiceConversationOptions,
} from './use-voice-conversation.js'

export { useAudioInputs } from './use-audio-inputs.js'
export type { AudioInput, AudioInputs } from './use-audio-inputs.js'

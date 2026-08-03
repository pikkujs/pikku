export { detectSilence } from './silence-detector.js'
export type {
  SilenceDetectorControl,
  SilenceDetectorHandlers,
} from './silence-detector.js'

export { detectSpeech } from './speech-detector.js'
export type {
  SpeechDetectorDiagnostics,
  SpeechDetectorHandlers,
  SpeechDetectorOptions,
  VadInstance,
  VadModule,
} from './speech-detector.js'

export { meterInput } from './input-level.js'

export { VoiceSession } from './voice-session.js'
export type { VoiceSessionOptions, VoiceTurn } from './voice-session.js'

export { AudioPlaybackQueue } from './audio-playback-queue.js'
export type { SpeechChunk, SpokenSoFar } from './audio-playback-queue.js'

export {
  spokenApproval,
  spokenApprovals,
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

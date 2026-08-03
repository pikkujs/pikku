import { useCallback, useEffect, useState } from 'react'

export interface AudioInput {
  deviceId: string
  label: string
}

/**
 * The microphones the browser will admit to, kept current as they come and go.
 *
 * The labels are the reason this is not a one-line `enumerateDevices` call at
 * the call site. Until the page has been granted microphone permission every
 * `label` is the empty string — the list is the right length and completely
 * unreadable — and the grant does not itself fire `devicechange`. So the list is
 * re-read whenever the caller says permission may have changed
 * ({@link AudioInputs.refresh}, which a voice UI should call after starting a
 * conversation) as well as on the device event, which covers the headset being
 * plugged in mid-call.
 */
export interface AudioInputs {
  devices: AudioInput[]
  /** Re-read the list. Call after microphone permission is granted. */
  refresh: () => Promise<void>
}

export const useAudioInputs = (): AudioInputs => {
  const [devices, setDevices] = useState<AudioInput[]>([])

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      setDevices(
        all
          .filter((device) => device.kind === 'audioinput')
          .map((device) => ({
            deviceId: device.deviceId,
            // An unlabelled device is one we have no permission to name yet.
            // Naming it by its id would be worse than useless — the ids are
            // long opaque hashes — so it gets a placeholder and the refresh
            // after permission replaces it with the real thing.
            label: device.label || 'Microphone',
          }))
      )
    } catch {
      // A browser that will not enumerate is one where the picker simply does
      // not appear. Nothing here is worth interrupting a conversation over.
    }
  }, [])

  useEffect(() => {
    void refresh()
    const target = navigator.mediaDevices
    if (!target?.addEventListener) return
    const onChange = () => void refresh()
    target.addEventListener('devicechange', onChange)
    return () => target.removeEventListener('devicechange', onChange)
  }, [refresh])

  return { devices, refresh }
}

import { spawn } from 'node:child_process'
import { existsSync, rmSync, statSync } from 'node:fs'

/**
 * Which scenarios keep their recording.
 *
 * Playwright decides recording when the context is created, which is before
 * anyone knows whether the scenario passes — so `failed` records everything and
 * throws away the passes, rather than recording selectively.
 */
export type VideoRetention = 'off' | 'failed' | 'all'

/**
 * What a run is allowed to capture, and where it goes.
 */
export interface CaptureOptions {
  /** Root directory for this run's artifacts. */
  dir: string
  /** The run these artifacts belong to — the folder everything is filed under. */
  runId: string
  /** Write the screenshots a scenario asks for by name. */
  screenshots?: boolean
  /**
   * Which scenarios keep their recording. Defaults to `failed`.
   *
   * Recording costs ~0.1-0.5s per actor context, nearly all of it finalising
   * the file on close, so the default is to record always and keep the footage
   * for the runs somebody is going to watch. Encoding is the expensive part and
   * only the kept videos pay it.
   */
  video?: VideoRetention
  /**
   * Re-encode kept videos with ffmpeg when it is on PATH.
   *
   * Worth doing by default: a scenario video is a mostly-static page with a
   * cursor moving over it, so consecutive frames are nearly identical and an
   * inter-frame codec collapses it to a fraction of the size. Without ffmpeg
   * the raw webm is kept as-is rather than failing the run — an uncompressed
   * artifact is still an artifact.
   */
  compress?: boolean
}

/** Filename-safe and stable for the same input. */
export const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'capture'

/** Is ffmpeg callable? Answered once; the answer cannot change mid-run. */
let ffmpegAvailable: Promise<boolean> | undefined
export const hasFfmpeg = (): Promise<boolean> => {
  ffmpegAvailable ??= new Promise<boolean>((resolve) => {
    const probe = spawn('ffmpeg', ['-version'], { stdio: 'ignore' })
    probe.on('error', () => resolve(false))
    probe.on('exit', (code) => resolve(code === 0))
  })
  return ffmpegAvailable
}

/**
 * Re-encode one recording to h264, keeping the original if the encode fails.
 *
 * `-crf 28` is deliberately aggressive. This footage is read by a person
 * checking whether a page looked right, not by anything measuring quality, and
 * the alternative to a heavily compressed video is usually no video at all
 * because nobody wants the disk cost.
 *
 * h264/mp4 rather than the VP9 this used to emit: measured on scenario
 * footage, `-preset veryfast` encodes ~11x faster than `libvpx-vp9 -crf 32`
 * AND lands ~30% smaller, and mp4 is the format that plays in every browser
 * without a second thought. VP9 lost on every axis that matters here.
 *
 * Returns the path of the file that survived, which is a NEW path on success:
 * the container changes with the codec.
 */
export const compressVideo = async (file: string): Promise<string> => {
  if (!(await hasFfmpeg())) {
    return file
  }
  const out = file.replace(/\.webm$/, '.mp4')

  const ok = await new Promise<boolean>((resolve) => {
    const proc = spawn(
      'ffmpeg',
      [
        '-y',
        '-i',
        file,
        '-c:v',
        'libx264',
        '-crf',
        '28',
        '-preset',
        'veryfast',
        // One keyframe every 10s: seeking matters less than size here, and
        // long GOPs are most of the win on near-static footage.
        '-g',
        '300',
        // Chrome records at odd dimensions often enough, and libx264 refuses
        // them outright rather than rounding.
        '-vf',
        'pad=ceil(iw/2)*2:ceil(ih/2)*2',
        '-movflags',
        '+faststart',
        '-an',
        out,
      ],
      { stdio: 'ignore' }
    )
    proc.on('error', () => resolve(false))
    proc.on('exit', (code) => resolve(code === 0))
  })

  if (!ok || !existsSync(out)) {
    return file
  }

  // Only replace the original if the encode actually saved something —
  // occasionally it does not, and a larger "compressed" file helps nobody.
  const before = statSync(file).size
  const after = statSync(out).size
  if (after >= before) {
    rmSync(out, { force: true })
    return file
  }

  rmSync(file, { force: true })
  return out
}

/**
 * Re-encode the recordings a run kept, answering where each one ended up.
 *
 * Takes the files rather than a directory to walk: the run already knows
 * exactly which recordings it filed and which scenario each belongs to, and
 * that record has to be updated with the new name — a compressed video whose
 * path nobody rewrote is a video the console links to and cannot find.
 *
 * ffmpeg is optional. Without it the raw recordings are kept exactly as
 * Playwright wrote them and the run still succeeds — but it says so, because a
 * silently-uncompressed artifact directory is how somebody discovers a
 * gigabyte of video a week later and has no idea why.
 */
export const compressVideos = async (
  files: string[],
  onWarn: (message: string) => void = console.warn
): Promise<Map<string, string>> => {
  const renamed = new Map<string, string>()
  if (files.length === 0) {
    return renamed
  }
  if (!(await hasFfmpeg())) {
    onWarn(
      '[pikku] ffmpeg is not on PATH — scenario videos were kept uncompressed. ' +
        'Install ffmpeg to shrink them; the footage is nearly static, so it compresses hard.'
    )
    return renamed
  }
  for (const file of files) {
    if (!existsSync(file)) {
      continue
    }
    const out = await compressVideo(file)
    if (out !== file) {
      renamed.set(file, out)
    }
  }
  return renamed
}

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * What a run is allowed to capture, and where it goes.
 *
 * Both are off by default. A scenario run is usually a pass/fail question and
 * writing a video per scenario to answer it is waste; the flags exist for the
 * runs where somebody is going to *look*.
 */
export interface CaptureOptions {
  /** Root directory for this run's artifacts. */
  dir: string
  /** The run these artifacts belong to — the folder everything is filed under. */
  runId: string
  /** Record a video per scenario. */
  video?: boolean
  /**
   * Re-encode finished videos with ffmpeg when it is on PATH.
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
 * Re-encode one video in place, keeping the original only if the encode fails.
 *
 * `-crf 32` with `libvpx-vp9` is deliberately aggressive. This footage is read
 * by a person checking whether a page looked right, not by anything measuring
 * quality, and the alternative to a heavily compressed video is usually no
 * video at all because nobody wants the disk cost.
 */
export const compressVideo = async (file: string): Promise<string> => {
  if (!(await hasFfmpeg())) {
    return file
  }
  const out = file.replace(/\.webm$/, '.compressed.webm')

  const ok = await new Promise<boolean>((resolve) => {
    const proc = spawn(
      'ffmpeg',
      [
        '-y',
        '-i',
        file,
        '-c:v',
        'libvpx-vp9',
        '-crf',
        '32',
        '-b:v',
        '0',
        // One keyframe every 10s: seeking matters less than size here, and
        // long GOPs are most of the win on near-static footage.
        '-g',
        '300',
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
  renameSync(out, file)
  return file
}

/**
 * Compress every `.webm` under a directory, in place.
 *
 * ffmpeg is optional. Without it the raw recordings are kept exactly as
 * Playwright wrote them and the run still succeeds — but it says so, because a
 * silently-uncompressed artifact directory is how somebody discovers a
 * gigabyte of video a week later and has no idea why.
 */
export const compressVideosIn = async (
  dir: string,
  onWarn: (message: string) => void = console.warn
): Promise<number> => {
  if (!existsSync(dir)) {
    return 0
  }
  if (!(await hasFfmpeg())) {
    onWarn(
      '[pikku] ffmpeg is not on PATH — scenario videos were kept uncompressed. ' +
        'Install ffmpeg to shrink them; the footage is nearly static, so it compresses hard.'
    )
    return 0
  }
  let count = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      count += await compressVideosIn(full, onWarn)
    } else if (entry.name.endsWith('.webm')) {
      await compressVideo(full)
      count++
    }
  }
  return count
}

/**
 * Video Frame Analysis — Key Frame Extraction
 *
 * Extracts key frames from animal videos for CV assessment.
 * Uses ffmpeg to sample frames at intervals, returning them
 * as image buffers compatible with the multi-photo CV pipeline.
 *
 * Requires ffmpeg to be installed and in PATH.
 *
 * Usage:
 *   const frames = await extractKeyFrames('https://shelter.com/video.mp4', 5);
 *   // frames is an array of JPEG Buffers
 *   // Pass to cv.assess(primaryPhotoUrl, [], { ... }) as additional images
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execFileAsync = promisify(execFile);

/**
 * Check if ffmpeg is available in PATH.
 */
export async function isFFmpegAvailable(): Promise<boolean> {
    try {
        await execFileAsync('ffmpeg', ['-version']);
        return true;
    } catch {
        return false;
    }
}

/**
 * Extract key frames from a video URL.
 *
 * @param videoUrl - URL to the video file
 * @param maxFrames - Maximum number of frames to extract (default: 4)
 * @returns Array of JPEG image buffers
 */
export async function extractKeyFrames(
    videoUrl: string,
    maxFrames: number = 4,
): Promise<Buffer[]> {
    // Validate ffmpeg availability
    if (!(await isFFmpegAvailable())) {
        console.warn('⚠ ffmpeg not found — video frame extraction disabled');
        return [];
    }

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gy-frames-'));

    try {
        // Step 1: Probe video duration
        let duration = 30; // default assumption
        try {
            const { stdout } = await execFileAsync('ffprobe', [
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                videoUrl,
            ]);
            const parsed = parseFloat(stdout.trim());
            if (!isNaN(parsed) && parsed > 0) duration = parsed;
        } catch {
            // Use default duration
        }

        // Step 2: Calculate interval between frames
        const interval = Math.max(1, Math.floor(duration / (maxFrames + 1)));

        // Step 3: Extract frames with ffmpeg
        const outputPattern = path.join(tmpDir, 'frame_%03d.jpg');

        await execFileAsync('ffmpeg', [
            '-i', videoUrl,
            '-vf', `fps=1/${interval}`,
            '-frames:v', String(maxFrames),
            '-q:v', '2',  // high quality JPEG
            '-y',
            outputPattern,
        ], {
            timeout: 30_000,
        });

        // Step 4: Read extracted frames as Buffers
        const files = await fs.promises.readdir(tmpDir);
        const frameFiles = files
            .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
            .sort();

        const frames: Buffer[] = [];
        for (const file of frameFiles.slice(0, maxFrames)) {
            const buf = await fs.promises.readFile(path.join(tmpDir, file));
            if (buf.length > 1000) { // skip corrupt/tiny frames
                frames.push(buf);
            }
        }

        console.log(`🎥 Extracted ${frames.length} key frames from video`);
        return frames;
    } catch (error) {
        console.warn(`⚠ Video frame extraction failed: ${(error as Error).message?.substring(0, 100)}`);
        return [];
    } finally {
        // Cleanup temp directory
        try {
            await fs.promises.rm(tmpDir, { recursive: true, force: true });
        } catch {
            // Non-fatal cleanup failure
        }
    }
}

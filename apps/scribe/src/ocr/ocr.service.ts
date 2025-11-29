import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ChildProcess, execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class OCRService implements OnModuleDestroy {
  private readonly logger = new Logger(OCRService.name);

  // Configuration
  private readonly MAX_PAGES = 10;
  private readonly TESSERACT_TIMEOUT = 60000; // 60 seconds per page
  private readonly PDFTOPPM_TIMEOUT = 120000; // 2 minutes for PDF conversion
  private readonly MIN_CHARS_FOR_EARLY_STOP = 500; // Stop early if we have enough text
  private readonly EARLY_STOP_AFTER_PAGES = 2; // Check for early stop after N pages

  // Track active child processes for cleanup on shutdown
  private activeProcesses: Set<ChildProcess> = new Set();

  /**
   * Cleanup on module destroy - kill any running processes
   */
  onModuleDestroy() {
    this.logger.log(
      `Cleaning up ${this.activeProcesses.size} active OCR processes...`,
    );
    for (const proc of this.activeProcesses) {
      try {
        proc.kill('SIGKILL');
      } catch {
        // Process may already be dead
      }
    }
    this.activeProcesses.clear();
  }

  /**
   * Determine optimal DPI based on file size to prevent OOM
   */
  private getDpiForFileSize(fileSizeBytes: number): number {
    const sizeMB = fileSizeBytes / (1024 * 1024);

    if (sizeMB < 5) {
      return 150; // Small files: high quality
    } else if (sizeMB < 20) {
      return 100; // Medium files: balanced
    } else {
      return 75; // Large files: fast processing, prevent OOM
    }
  }

  async recognize(
    image: Buffer,
    config: { lang?: string; oem?: number; psm?: number } = {
      lang: 'eng',
      oem: 1,
      psm: 3,
    },
  ): Promise<string> {
    const startTime = Date.now();

    try {
      this.logger.debug('Starting OCR recognition');
      this.logger.debug(
        `Buffer size: ${image.length}, First bytes: ${image.slice(0, 10).toString('hex')}`,
      );

      const isPdfFile = this.isPdf(image);
      this.logger.debug(`Is PDF: ${isPdfFile}`);

      let result: string;

      if (isPdfFile) {
        this.logger.log('PDF detected, converting to images and processing...');
        result = await this.processPdf(image, config);
      } else {
        this.logger.log('Processing as image...');
        result = await this.runTesseract(image, config);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(`OCR completed in ${duration}s, ${result.length} chars`);

      return result;
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.error(`OCR failed after ${duration}s`);
      this.logger.error(error);
      throw error;
    }
  }

  private isPdf(buffer: Buffer): boolean {
    // Check for %PDF magic bytes - they might be at the start or after some whitespace
    const header = buffer.slice(0, 1024).toString('ascii');
    return header.includes('%PDF');
  }

  private async runTesseract(
    imageBuffer: Buffer,
    config: { lang?: string; oem?: number; psm?: number },
  ): Promise<string> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tesseract-'));
    const inputPath = path.join(tmpDir, 'input.png');
    const outputBase = path.join(tmpDir, 'output');

    try {
      // Write buffer to file
      fs.writeFileSync(inputPath, imageBuffer);

      // Run tesseract using file-based I/O with detached process
      const args = [
        inputPath,
        outputBase,
        '-l',
        config.lang || 'eng',
        '--oem',
        String(config.oem || 1),
        '--psm',
        String(config.psm || 3),
      ];

      await new Promise<void>((resolve, reject) => {
        // Spawn with detached: true so we can properly kill the entire process tree
        const proc = spawn('tesseract', args, {
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        // Track this process for cleanup
        this.activeProcesses.add(proc);

        let stderr = '';
        let killed = false;

        // Handle SIGTERM during job execution
        const sigTermHandler = () => {
          if (!killed) {
            killed = true;
            this.killProcessTree(proc);
            reject(new Error('Tesseract killed due to SIGTERM'));
          }
        };
        process.on('SIGTERM', sigTermHandler);

        // Add timeout to prevent hanging
        const timeout = setTimeout(() => {
          if (!killed) {
            killed = true;
            this.killProcessTree(proc);
            reject(
              new Error(
                `Tesseract timed out after ${this.TESSERACT_TIMEOUT / 1000}s`,
              ),
            );
          }
        }, this.TESSERACT_TIMEOUT);

        proc.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          clearTimeout(timeout);
          process.removeListener('SIGTERM', sigTermHandler);
          this.activeProcesses.delete(proc);

          if (killed) return; // Already rejected

          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Tesseract exited with code ${code}: ${stderr}`));
          }
        });

        proc.on('error', (err) => {
          clearTimeout(timeout);
          process.removeListener('SIGTERM', sigTermHandler);
          this.activeProcesses.delete(proc);
          if (!killed) reject(err);
        });
      });

      // Read output
      const outputPath = outputBase + '.txt';
      if (fs.existsSync(outputPath)) {
        return fs.readFileSync(outputPath, 'utf-8');
      }
      return '';
    } finally {
      // Cleanup temp files
      this.cleanupTmpDir(tmpDir);
    }
  }

  private async processPdf(
    buffer: Buffer,
    config: { lang?: string; oem?: number; psm?: number },
  ): Promise<string> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-'));
    const pdfPath = path.join(tmpDir, 'input.pdf');
    const outputPrefix = path.join(tmpDir, 'page');

    // Dynamic DPI based on file size
    const dpi = this.getDpiForFileSize(buffer.length);
    this.logger.debug(
      `Using DPI ${dpi} for ${(buffer.length / 1024 / 1024).toFixed(1)}MB PDF`,
    );

    try {
      fs.writeFileSync(pdfPath, buffer);

      // Convert PDF to PNG images using pdftoppm with grayscale for faster processing
      execSync(
        `pdftoppm -png -gray -r ${dpi} -l ${this.MAX_PAGES} "${pdfPath}" "${outputPrefix}"`,
        { timeout: this.PDFTOPPM_TIMEOUT },
      );

      const pageFiles = fs
        .readdirSync(tmpDir)
        .filter((f) => f.startsWith('page-') && f.endsWith('.png'))
        .sort();

      if (pageFiles.length === 0) {
        throw new Error('No pages extracted from PDF');
      }

      this.logger.debug(`Extracted ${pageFiles.length} pages from PDF`);

      // Process each page with early stopping
      const textParts: string[] = [];
      let totalChars = 0;

      for (let i = 0; i < pageFiles.length; i++) {
        const pageFile = pageFiles[i];
        const pagePath = path.join(tmpDir, pageFile);
        const pageBuffer = fs.readFileSync(pagePath);

        const pageText = await this.runTesseract(pageBuffer, config);
        const trimmedText = pageText.trim();
        textParts.push(trimmedText);
        totalChars += trimmedText.length;

        // Early stopping: if we have enough text after first N pages, stop
        if (
          i + 1 >= this.EARLY_STOP_AFTER_PAGES &&
          totalChars >= this.MIN_CHARS_FOR_EARLY_STOP &&
          i + 1 < pageFiles.length
        ) {
          this.logger.debug(
            `Early stop after ${i + 1} pages (${totalChars} chars). Skipping ${pageFiles.length - i - 1} remaining pages.`,
          );
          break;
        }
      }

      const fullText = textParts.join('\n\n--- Page Break ---\n\n');
      this.logger.debug(
        `OCR completed for ${textParts.length}/${pageFiles.length} pages. Total ${fullText.length} characters.`,
      );

      return fullText;
    } finally {
      // Cleanup temp files
      this.cleanupTmpDir(tmpDir);
    }
  }

  /**
   * Kill a process and its entire process tree
   */
  private killProcessTree(proc: ChildProcess): void {
    try {
      if (proc.pid) {
        // Kill the entire process group (negative PID)
        process.kill(-proc.pid, 'SIGKILL');
      }
    } catch {
      // Fallback: try killing just the process
      try {
        proc.kill('SIGKILL');
      } catch {
        // Process already dead
      }
    }
  }

  /**
   * Safely cleanup a temporary directory
   */
  private cleanupTmpDir(tmpDir: string): void {
    try {
      const files = fs.readdirSync(tmpDir);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(tmpDir, file));
        } catch {
          // Ignore individual file cleanup errors
        }
      }
      fs.rmdirSync(tmpDir);
    } catch {
      // Ignore cleanup errors - system will clean /tmp eventually
      this.logger.warn(`Failed to cleanup temp dir: ${tmpDir}`);
    }
  }
}

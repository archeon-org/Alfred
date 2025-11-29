import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ChildProcess, execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

@Injectable()
export class OCRService implements OnModuleDestroy {
  private readonly logger = new Logger(OCRService.name);

  // Configuration
  private readonly MAX_PAGES = 10;
  private readonly TESSERACT_TIMEOUT = 60000; // 60 seconds per page
  private readonly PDFTOPPM_TIMEOUT = 120000; // 2 minutes for PDF conversion
  private readonly MIN_TEXT_DENSITY = 0.1; // Min ratio of alphanumeric chars
  private readonly MIN_LINES_WITH_TEXT = 3; // Min lines with actual content
  private readonly EARLY_STOP_AFTER_PAGES = 2; // Check for early stop after N pages

  // DPI fallback chain for retry mechanism
  private readonly DPI_CHAIN = [150, 100, 75];

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
   * Determine starting DPI index based on file size
   */
  private getStartingDpiIndex(fileSizeBytes: number): number {
    const sizeMB = fileSizeBytes / (1024 * 1024);

    if (sizeMB < 5) {
      return 0; // Start at 150 DPI
    } else if (sizeMB < 20) {
      return 1; // Start at 100 DPI
    } else {
      return 2; // Start at 75 DPI
    }
  }

  /**
   * Check if text extraction was successful using density heuristics
   */
  private isTextExtractionSuccessful(text: string): boolean {
    if (!text || text.length < 50) return false;

    // Count alphanumeric characters
    const alphanumericCount = (text.match(/[a-zA-Z0-9]/g) || []).length;
    const density = alphanumericCount / text.length;

    // Count lines with meaningful content (at least 3 alphanumeric chars)
    const lines = text.split('\n');
    const meaningfulLines = lines.filter(
      (line) => (line.match(/[a-zA-Z0-9]/g) || []).length >= 3,
    ).length;

    return (
      density >= this.MIN_TEXT_DENSITY &&
      meaningfulLines >= this.MIN_LINES_WITH_TEXT
    );
  }

  /**
   * Check if PDF already contains extractable text (skip OCR if possible)
   */
  private async hasEmbeddedText(pdfPath: string): Promise<string | null> {
    try {
      // Use pdftotext to extract embedded text (much faster than OCR)
      const { stdout } = await execFileAsync(
        'pdftotext',
        ['-l', '2', pdfPath, '-'], // Only check first 2 pages
        { timeout: 10000 }, // 10 second timeout
      );

      const text = stdout.trim();

      // Check if we got meaningful text
      if (this.isTextExtractionSuccessful(text)) {
        this.logger.log(
          `PDF has embedded text (${text.length} chars), skipping OCR`,
        );
        return text;
      }

      return null;
    } catch {
      // pdftotext failed or not installed, proceed with OCR
      return null;
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

    try {
      fs.writeFileSync(pdfPath, buffer);

      // 🚀 FAST PATH: Check if PDF has embedded text (skip OCR entirely)
      const embeddedText = await this.hasEmbeddedText(pdfPath);
      if (embeddedText) {
        return embeddedText;
      }

      // OCR path: try with DPI fallback chain
      const startingDpiIndex = this.getStartingDpiIndex(buffer.length);
      let lastError: Error | null = null;

      for (
        let dpiIndex = startingDpiIndex;
        dpiIndex < this.DPI_CHAIN.length;
        dpiIndex++
      ) {
        const dpi = this.DPI_CHAIN[dpiIndex];
        this.logger.debug(
          `Attempting OCR with DPI ${dpi} for ${(buffer.length / 1024 / 1024).toFixed(1)}MB PDF`,
        );

        try {
          const result = await this.processPdfWithDpi(
            tmpDir,
            pdfPath,
            dpi,
            config,
          );

          // Check if extraction was successful
          if (this.isTextExtractionSuccessful(result)) {
            return result;
          }

          // If we got poor results, try next DPI
          if (dpiIndex + 1 < this.DPI_CHAIN.length) {
            this.logger.debug(
              `Poor text extraction at ${dpi} DPI, trying ${this.DPI_CHAIN[dpiIndex + 1]} DPI`,
            );
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          this.logger.warn(`OCR failed at ${dpi} DPI: ${lastError.message}`);

          // Clean up page files before retry
          this.cleanupPageFiles(tmpDir);
        }
      }

      // If all DPIs failed, throw the last error
      if (lastError) {
        throw lastError;
      }

      return '';
    } finally {
      this.cleanupTmpDir(tmpDir);
    }
  }

  /**
   * Process PDF at a specific DPI using non-blocking execFile
   */
  private async processPdfWithDpi(
    tmpDir: string,
    pdfPath: string,
    dpi: number,
    config: { lang?: string; oem?: number; psm?: number },
  ): Promise<string> {
    const outputPrefix = path.join(tmpDir, 'page');

    // Convert PDF to PNG using non-blocking execFile
    await execFileAsync(
      'pdftoppm',
      [
        '-png',
        '-gray',
        '-r',
        String(dpi),
        '-l',
        String(this.MAX_PAGES),
        pdfPath,
        outputPrefix,
      ],
      { timeout: this.PDFTOPPM_TIMEOUT },
    );

    const pageFiles = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith('page-') && f.endsWith('.png'))
      .sort();

    if (pageFiles.length === 0) {
      throw new Error('No pages extracted from PDF');
    }

    this.logger.debug(`Extracted ${pageFiles.length} pages at ${dpi} DPI`);

    // Process each page with smart early stopping
    const textParts: string[] = [];
    let consecutivePoorPages = 0;

    for (let i = 0; i < pageFiles.length; i++) {
      const pageFile = pageFiles[i];
      const pagePath = path.join(tmpDir, pageFile);
      const pageBuffer = fs.readFileSync(pagePath);

      const pageText = await this.runTesseract(pageBuffer, config);
      const trimmedText = pageText.trim();
      textParts.push(trimmedText);

      // Check text density for this page
      const pageHasGoodText = this.isTextExtractionSuccessful(trimmedText);

      if (pageHasGoodText) {
        consecutivePoorPages = 0;
      } else {
        consecutivePoorPages++;
      }

      // Smart early stopping conditions
      if (i + 1 >= this.EARLY_STOP_AFTER_PAGES) {
        const totalText = textParts.join(' ');

        // Stop if we have good text density overall
        if (
          this.isTextExtractionSuccessful(totalText) &&
          i + 1 < pageFiles.length
        ) {
          this.logger.debug(
            `Early stop after ${i + 1} pages (good density). Skipping ${pageFiles.length - i - 1} remaining.`,
          );
          break;
        }

        // Stop if last 2 pages had poor text (likely blank/image pages)
        if (consecutivePoorPages >= 2 && i + 1 < pageFiles.length) {
          this.logger.debug(
            `Early stop after ${i + 1} pages (${consecutivePoorPages} poor pages). Skipping rest.`,
          );
          break;
        }
      }
    }

    const fullText = textParts.join('\n\n--- Page Break ---\n\n');
    this.logger.debug(
      `OCR completed for ${textParts.length}/${pageFiles.length} pages. Total ${fullText.length} chars.`,
    );

    return fullText;
  }

  /**
   * Clean up page files only (for retry with different DPI)
   */
  private cleanupPageFiles(tmpDir: string): void {
    try {
      const files = fs.readdirSync(tmpDir);
      for (const file of files) {
        if (file.startsWith('page-') && file.endsWith('.png')) {
          try {
            fs.unlinkSync(path.join(tmpDir, file));
          } catch {
            // Ignore
          }
        }
      }
    } catch {
      // Ignore
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

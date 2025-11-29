import { Injectable, Logger } from '@nestjs/common';
import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class OCRService {
  private readonly logger = new Logger(OCRService.name);
  private readonly MAX_PAGES = 10;
  // 150 DPI is a good balance between quality and speed
  // 300 DPI was causing Tesseract to run for 5-7+ minutes per page
  private readonly PDF_DPI = 150;

  async recognize(
    image: Buffer,
    config: { lang?: string; oem?: number; psm?: number } = {
      lang: 'eng',
      oem: 1,
      psm: 3,
    },
  ): Promise<string> {
    try {
      this.logger.debug('Starting OCR recognition');
      this.logger.debug(
        `Buffer size: ${image.length}, First bytes: ${image.slice(0, 10).toString('hex')}`,
      );

      const isPdfFile = this.isPdf(image);
      this.logger.debug(`Is PDF: ${isPdfFile}`);

      if (isPdfFile) {
        this.logger.log('PDF detected, converting to images and processing...');
        return await this.processPdf(image, config);
      }

      this.logger.log('Processing as image...');
      return await this.runTesseract(image, config);
    } catch (error) {
      this.logger.error('OCR recognition failed');
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
    const TESSERACT_TIMEOUT = 60000; // 60 seconds per page

    try {
      // Write buffer to file
      fs.writeFileSync(inputPath, imageBuffer);

      // Run tesseract using file-based I/O
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
        const proc = spawn('tesseract', args);
        let stderr = '';
        let killed = false;

        // Add timeout to prevent hanging
        const timeout = setTimeout(() => {
          killed = true;
          proc.kill('SIGKILL');
          reject(
            new Error(`Tesseract timed out after ${TESSERACT_TIMEOUT / 1000}s`),
          );
        }, TESSERACT_TIMEOUT);

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          clearTimeout(timeout);
          if (killed) return; // Already rejected by timeout
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Tesseract exited with code ${code}: ${stderr}`));
          }
        });

        proc.on('error', (err) => {
          clearTimeout(timeout);
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
      // Cleanup
      try {
        const files = fs.readdirSync(tmpDir);
        for (const file of files) {
          fs.unlinkSync(path.join(tmpDir, file));
        }
        fs.rmdirSync(tmpDir);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private async processPdf(
    buffer: Buffer,
    config: { lang?: string; oem?: number; psm?: number },
  ): Promise<string> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-'));
    const pdfPath = path.join(tmpDir, 'input.pdf');
    const outputPrefix = path.join(tmpDir, 'page');

    try {
      fs.writeFileSync(pdfPath, buffer);

      // Convert PDF to PNG images using pdftoppm
      // Using 150 DPI instead of 300 for faster processing (4x less pixels)
      execSync(
        `pdftoppm -png -r ${this.PDF_DPI} -l ${this.MAX_PAGES} "${pdfPath}" "${outputPrefix}"`,
        { timeout: 120000 },
      );

      const pageFiles = fs
        .readdirSync(tmpDir)
        .filter((f) => f.startsWith('page-') && f.endsWith('.png'))
        .sort();

      if (pageFiles.length === 0) {
        throw new Error('No pages extracted from PDF');
      }

      this.logger.debug(`Extracted ${pageFiles.length} pages from PDF`);

      // Process each page and concatenate text
      const textParts: string[] = [];
      for (const pageFile of pageFiles) {
        const pagePath = path.join(tmpDir, pageFile);
        const pageBuffer = fs.readFileSync(pagePath);
        const pageText = await this.runTesseract(pageBuffer, config);
        textParts.push(pageText.trim());
      }

      const fullText = textParts.join('\n\n--- Page Break ---\n\n');
      this.logger.debug(
        `OCR completed for ${pageFiles.length} pages. Total ${fullText.length} characters.`,
      );

      return fullText;
    } finally {
      // Cleanup temp files
      try {
        const files = fs.readdirSync(tmpDir);
        for (const file of files) {
          fs.unlinkSync(path.join(tmpDir, file));
        }
        fs.rmdirSync(tmpDir);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

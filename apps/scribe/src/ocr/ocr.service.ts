import { Injectable, Logger } from '@nestjs/common';
import * as tesseract from 'node-tesseract-ocr';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class OCRService {
  private readonly logger = new Logger(OCRService.name);
  private readonly MAX_PAGES = 10;

  async recognize(
    image: Buffer,
    config: tesseract.Config = {
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
      const text = await tesseract.recognize(image, config);
      this.logger.debug(`OCR completed. Extracted ${text.length} characters.`);
      return text;
    } catch (error) {
      this.logger.error('OCR recognition failed');
      this.logger.error(error);
      throw error;
    }
  }

  private isPdf(buffer: Buffer): boolean {
    // Check for %PDF magic bytes - they might be at the start or after some whitespace
    // Standard PDF starts with %PDF, but some PDFs have leading whitespace
    const header = buffer.slice(0, 1024).toString('ascii');
    return header.includes('%PDF');
  }

  private async processPdf(
    buffer: Buffer,
    config: tesseract.Config,
  ): Promise<string> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-'));
    const pdfPath = path.join(tmpDir, 'input.pdf');
    const outputPrefix = path.join(tmpDir, 'page');

    try {
      fs.writeFileSync(pdfPath, buffer);

      // Convert PDF to PNG images using pdftoppm
      execSync(
        `pdftoppm -png -r 300 -l ${this.MAX_PAGES} "${pdfPath}" "${outputPrefix}"`,
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
        const pageBuffer = fs.readFileSync(path.join(tmpDir, pageFile));
        const pageText = await tesseract.recognize(pageBuffer, config);
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

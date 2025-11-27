import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

export interface ClassificationResult {
  categoryId: string | null;
  tagIds: string[];
  title: string;
}

export interface TitleGenerationResult {
  title: string;
}

@Injectable()
export class ClassificationService {
  private readonly logger = new Logger(ClassificationService.name);
  private readonly client: OpenAI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('FIREWORKS_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'FIREWORKS_API_KEY is not set. AI classification will fail.',
      );
    }

    this.client = new OpenAI({
      apiKey: apiKey || 'dummy-key',
      baseURL: 'https://api.fireworks.ai/inference/v1',
    });
  }

  async classifyDocument(
    content: string,
    categories: { id: string; name: string }[],
    tags: { id: string; name: string }[],
    originalFileName?: string,
  ): Promise<ClassificationResult> {
    try {
      this.logger.log('Starting AI classification...');

      // Limit content to ~2000 tokens (approx 8000 chars) to avoid context limits and reduce costs
      // We take the first 4000 chars and last 4000 chars to get header/footer info which is often relevant
      const truncatedContent =
        content.length > 8000
          ? content.substring(0, 4000) +
            '\n...\n' +
            content.substring(content.length - 4000)
          : content;

      this.logger.debug(
        `Content truncated from ${content.length} to ${truncatedContent.length} characters.`,
      );

      const ClassificationSchema = z.object({
        categoryId: z
          .string()
          .nullable()
          .describe(
            'The ID of the most relevant category, or null if none match.',
          ),
        tagIds: z.array(z.string()).describe('Array of IDs of relevant tags.'),
        title: z
          .string()
          .describe(
            'A concise, descriptive title for the document (max 60 characters). Should be human-readable and describe what the document is about.',
          ),
        confidence: z
          .enum(['high', 'medium', 'low'])
          .describe('Your confidence level in the classification.'),
        reasoning: z
          .string()
          .describe('Brief explanation of why you chose this classification.'),
      });

      // Format categories and tags for clearer presentation
      const formattedCategories =
        categories.length > 0
          ? categories.map((c) => `- "${c.name}" (ID: ${c.id})`).join('\n')
          : '(No categories defined yet)';

      const formattedTags =
        tags.length > 0
          ? tags.map((t) => `- "${t.name}" (ID: ${t.id})`).join('\n')
          : '(No tags defined yet)';

      const prompt = `You are an intelligent document classifier for a personal document management system.
Your task is to analyze the document content and:
1. Assign the most appropriate category and tags from the user's existing lists
2. Generate a clear, descriptive title for the document

${originalFileName ? `Original filename: "${originalFileName}"` : ''}

## Available Categories:
${formattedCategories}

## Available Tags:
${formattedTags}

## Classification Guidelines:

### Title Generation:
- Create a concise, human-readable title (max 60 characters)
- The title should describe WHAT the document is (e.g., "Electricity Bill - January 2024", "Apartment Lease Agreement", "Car Insurance Policy")
- Include relevant details like dates, company names, or key identifiers when available
- Use the document's language for the title (if document is in French, title should be in French)
- Do NOT use the filename as the title unless it's already descriptive
- Do NOT include file extensions in the title

### Category Selection:
- Select the ONE category that best matches the document's primary purpose or type
- Be flexible with interpretation: a utility bill could match "Bills", "Utilities", "Expenses", "Monthly", "Home", etc.
- Consider synonyms and related concepts (e.g., "Receipts" could apply to invoices, purchase confirmations, etc.)
- Consider the document's language - category names may be in a different language than the document content
- If a category is a reasonable fit (even partial), prefer selecting it over returning null
- Only return null for categoryId if truly no category is even remotely applicable

### Tag Selection:
- Select ALL tags that are relevant to the document, even if only partially
- Be generous with tags - if a tag could reasonably apply, include it
- Tags can represent: document type, source, time period, topic, importance, etc.
- Empty tag list [] is acceptable if no tags apply

### Strict Rules (NEVER violate):
- You MUST only use IDs from the provided lists above
- NEVER invent, generate, or hallucinate new IDs
- If you're unsure about a category, prefer null over guessing a wrong ID
- Double-check that every ID you return exists in the lists above

### Examples of flexible matching:
- Document: French tax form → Category: "Taxes" or "Impôts" or "Finance" or "Government"
- Document: Amazon receipt → Tags: "Shopping", "Online", "Receipts", "E-commerce"
- Document: Lease agreement → Category: "Housing", "Contracts", "Legal", "Rental"
`;

      this.logger.debug(`Sending prompt to AI model: ${prompt}`);

      const response = await this.client.chat.completions.create({
        model: 'accounts/fireworks/models/deepseek-v3p1-terminus', // Using the requested model
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `Document Content:\n${truncatedContent}` },
        ],
        response_format: zodResponseFormat(
          ClassificationSchema,
          'classification',
        ),
        temperature: 0.2, // Slightly higher for more flexible matching, still deterministic enough
      });

      const result = response.choices[0].message.content;
      if (!result) {
        throw new Error('Empty response from AI model');
      }

      this.logger.debug(`Raw AI response: ${result}`);

      const parsed = JSON.parse(result);

      // Log reasoning and confidence for debugging/monitoring
      this.logger.log(
        `AI Classification - Confidence: ${parsed.confidence}, Reasoning: ${parsed.reasoning}`,
      );

      // Validate IDs to prevent hallucination - only keep IDs that actually exist
      const validCategoryIds = new Set(categories.map((c) => c.id));
      const validTagIds = new Set(tags.map((t) => t.id));

      const validatedCategoryId =
        parsed.categoryId && validCategoryIds.has(parsed.categoryId)
          ? parsed.categoryId
          : null;

      const validatedTagIds = (parsed.tagIds || []).filter((id: string) =>
        validTagIds.has(id),
      );

      // Log if we had to filter out hallucinated IDs
      if (parsed.categoryId && !validatedCategoryId) {
        this.logger.warn(
          `AI hallucinated categoryId "${parsed.categoryId}" - filtered out`,
        );
      }

      const filteredOutTags = (parsed.tagIds || []).filter(
        (id: string) => !validTagIds.has(id),
      );
      if (filteredOutTags.length > 0) {
        this.logger.warn(
          `AI hallucinated tagIds ${JSON.stringify(filteredOutTags)} - filtered out`,
        );
      }

      this.logger.log(
        `Validated Classification result: categoryId=${validatedCategoryId}, tagIds=${JSON.stringify(validatedTagIds)}, title="${parsed.title}"`,
      );

      return {
        categoryId: validatedCategoryId,
        tagIds: validatedTagIds,
        title: parsed.title || originalFileName || 'Untitled Document',
      };
    } catch (error) {
      this.logger.error('AI Classification failed', error);
      // Return neutral result on failure so processing can continue
      return {
        categoryId: null,
        tagIds: [],
        title: originalFileName || 'Untitled Document',
      };
    }
  }

  /**
   * Generate only a title for a document (lighter than full classification)
   * Used for manual uploads where user wants AI-generated title without classification
   */
  async generateTitle(
    content: string,
    originalFileName?: string,
  ): Promise<TitleGenerationResult> {
    try {
      this.logger.log('Starting AI title generation...');

      // Limit content - we need less context for title generation
      const truncatedContent =
        content.length > 4000
          ? content.substring(0, 2000) +
            '\n...\n' +
            content.substring(content.length - 2000)
          : content;

      const TitleSchema = z.object({
        title: z
          .string()
          .describe(
            'A concise, descriptive title for the document (max 60 characters).',
          ),
        reasoning: z
          .string()
          .describe('Brief explanation of why you chose this title.'),
      });

      const prompt = `You are a document naming assistant. Your task is to generate a clear, descriptive title for a document.

${originalFileName ? `Original filename: "${originalFileName}"` : ''}

## Title Generation Rules:
- Create a concise, human-readable title (max 60 characters)
- The title should describe WHAT the document is about
- Examples of good titles:
  - "Electricity Bill - January 2024"
  - "Apartment Lease Agreement"
  - "Car Insurance Policy - Renewal"
  - "Medical Test Results - Blood Work"
  - "Restaurant Receipt - 15 Nov 2024"
- Include relevant details like dates, company names, or key identifiers when available
- Use the document's language for the title (if document is in French, title should be in French)
- Do NOT use the original filename unless it's already descriptive
- Do NOT include file extensions (.pdf, .jpg, etc.)
- Do NOT use generic titles like "Document" or "File"
`;

      const response = await this.client.chat.completions.create({
        model: 'accounts/fireworks/models/deepseek-v3p1-terminus',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `Document Content:\n${truncatedContent}` },
        ],
        response_format: zodResponseFormat(TitleSchema, 'title_generation'),
        temperature: 0.2,
      });

      const result = response.choices[0].message.content;
      if (!result) {
        throw new Error('Empty response from AI model');
      }

      this.logger.debug(`Raw AI title response: ${result}`);

      const parsed = JSON.parse(result);

      this.logger.log(
        `AI Title Generation - Title: "${parsed.title}", Reasoning: ${parsed.reasoning}`,
      );

      return {
        title: parsed.title || originalFileName || 'Untitled Document',
      };
    } catch (error) {
      this.logger.error('AI Title generation failed', error);
      return {
        title: originalFileName || 'Untitled Document',
      };
    }
  }
}

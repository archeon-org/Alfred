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
          .describe(
            'The ID of the best matching category. You MUST always select a category - pick the closest match even if imperfect.',
          ),
        tagIds: z.array(z.string()).describe('Array of IDs of relevant tags.'),
        title: z
          .string()
          .describe(
            'A concise, descriptive title for the document (max 60 characters). Should be human-readable and describe what the document is about.',
          ),
        confidence: z
          .enum(['high', 'medium', 'low'])
          .describe('Your confidence level in the category match.'),
        reasoning: z
          .string()
          .describe('Brief explanation of why you chose this category.'),
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

      const prompt = `You are a document classifier for a personal document management system. Your job is to categorize documents into the user's existing folder structure.

${originalFileName ? `Original filename: "${originalFileName}"` : ''}

## USER'S CATEGORIES (folders):
${formattedCategories}

## USER'S TAGS (labels):
${formattedTags}

---

## YOUR TASK:

### 1. CATEGORY SELECTION (MANDATORY - You MUST pick one)
**CRITICAL: Every document MUST be assigned to a category. There is no "null" or "none" option.**

The user has created these categories to organize their documents. Your job is to find the BEST FIT, not a perfect match.

**Selection Strategy (in order of priority):**
1. **Direct match**: Document clearly belongs to a category (e.g., invoice → "Bills", course notes → "Lecture Notes")
2. **Semantic similarity**: Document relates to the category's theme (e.g., traffic fine → "Library Fines" because both are fines/penalties)
3. **Functional similarity**: Document serves a similar purpose (e.g., payment receipt → "Tuition & Fees" if it's a payment-related category)
4. **Catch-all match**: If nothing else works, pick the most general/administrative category (e.g., "Student ID/Admin", "References/CV", or any category that could serve as "miscellaneous")

**Think creatively about connections:**
- A traffic fine receipt could go in "Library Fines" (both are fines/penalties)
- A restaurant receipt could go in "Meal Plan" (both are food-related)
- An insurance document could go in "Health/Gym" (health-related) or "Transport/Bus Pass" (vehicle-related)
- A random administrative document could go in "Student ID/Admin" (administrative catch-all)
- A personal document could go in "Parent/Guardian Info" (personal/family category)

### 2. TITLE GENERATION
- Create a clear, descriptive title (max 60 characters)
- Include dates, amounts, or key identifiers when available
- Use the document's language (French document → French title)
- Examples: "Facture EDF - Janvier 2024", "Contrat de bail - Appartement", "Amende routière - 135€"

### 3. TAG SELECTION
- Select ALL relevant tags
- Be generous - if a tag might apply, include it
- "Important", "PDF", "Reference", "Admin" are often applicable
- Empty array [] is OK if truly no tags fit

---

## STRICT RULES:
1. **ALWAYS return a categoryId** - never null, never empty
2. **Only use IDs from the lists above** - never invent IDs
3. **Verify each ID exists** before including it
4. If you're uncertain between categories, pick the one with the loosest interpretation

---

## EXAMPLES OF CREATIVE MATCHING:

Document: French traffic fine payment receipt
Available categories: Student-focused (Course Syllabus, Lecture Notes, Library Fines, Transport/Bus Pass, etc.)
→ Best choice: "Library Fines" (both are fines/penalties) OR "Transport/Bus Pass" (vehicle-related)

Document: Amazon purchase receipt  
Available categories: Student-focused
→ Best choice: "Tuition & Fees" (payment record) OR "Student ID/Admin" (personal admin)

Document: Medical test results
Available categories: Student-focused with "Health/Gym"
→ Best choice: "Health/Gym" (health-related)

Document: Random PDF with unclear content
Available categories: Student-focused
→ Best choice: "Student ID/Admin" or "References/CV" (general catch-all)
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

      let validatedCategoryId =
        parsed.categoryId && validCategoryIds.has(parsed.categoryId)
          ? parsed.categoryId
          : null;

      // If AI returned null or invalid ID, pick the first available category as fallback
      // This ensures every document gets categorized
      if (!validatedCategoryId && categories.length > 0) {
        validatedCategoryId = categories[0].id;
        this.logger.warn(
          `AI returned no valid category - using fallback: "${categories[0].name}" (${categories[0].id})`,
        );
      }

      const validatedTagIds = (parsed.tagIds || []).filter((id: string) =>
        validTagIds.has(id),
      );

      // Log if we had to filter out hallucinated IDs
      if (parsed.categoryId && !validCategoryIds.has(parsed.categoryId)) {
        this.logger.warn(
          `AI hallucinated categoryId "${parsed.categoryId}" - using fallback category`,
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
      // Return fallback result on failure - use first category if available
      return {
        categoryId: categories.length > 0 ? categories[0].id : null,
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

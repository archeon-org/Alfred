import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { encode as toonEncode } from '@toon-format/toon';

export interface ClassificationResult {
  categoryId: string | null;
  // If these are set, create a new category instead of using categoryId
  newCategory: {
    name: string;
    icon: string; // Ionicons icon name (e.g., "document-outline")
    color: string; // Hex color code (balanced for dark/light themes)
  } | null;
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

      const NewCategorySchema = z.object({
        name: z
          .string()
          .describe(
            'Category name (max 25 chars, 1-3 words, simple and clear).',
          ),
        icon: z
          .string()
          .describe(
            'Ionicons icon name. Choose from: document-outline, folder-outline, receipt-outline, cash-outline, card-outline, wallet-outline, briefcase-outline, medkit-outline, heart-outline, fitness-outline, car-outline, airplane-outline, home-outline, business-outline, school-outline, library-outline, book-outline, newspaper-outline, mail-outline, chatbubbles-outline, people-outline, person-outline, id-card-outline, key-outline, lock-closed-outline, shield-outline, warning-outline, alert-circle-outline, checkbox-outline, clipboard-outline, calendar-outline, time-outline, calculator-outline, cart-outline, pricetag-outline, gift-outline, restaurant-outline, cafe-outline, beer-outline, musical-notes-outline, game-controller-outline, camera-outline, images-outline, film-outline, tv-outline, phone-portrait-outline, laptop-outline, desktop-outline, cloud-outline, server-outline, code-outline, construct-outline, hammer-outline, build-outline, cog-outline, settings-outline, flask-outline, leaf-outline, flower-outline, paw-outline, globe-outline, map-outline, location-outline, flag-outline, star-outline, trophy-outline, ribbon-outline, sparkles-outline, bulb-outline, flash-outline, battery-charging-outline, water-outline, thermometer-outline, sunny-outline, moon-outline, cloudy-outline, rainy-outline, snow-outline, umbrella-outline, boat-outline, bus-outline, train-outline, bicycle-outline, football-outline, basketball-outline, tennisball-outline, barbell-outline, pizza-outline, nutrition-outline, wine-outline, ice-cream-outline, fast-food-outline, body-outline, hand-left-outline, happy-outline, sad-outline, skull-outline, bug-outline, bonfire-outline, compass-outline, megaphone-outline, notifications-outline, volume-high-outline, mic-outline, headset-outline, radio-outline, print-outline, scan-outline, qr-code-outline, barcode-outline, finger-print-outline, eye-outline, glasses-outline, brush-outline, color-palette-outline, pencil-outline, create-outline, cut-outline, copy-outline, download-outline, share-outline, archive-outline, trash-outline, file-tray-outline, file-tray-full-outline, albums-outline, grid-outline, list-outline, layers-outline, pie-chart-outline, stats-chart-outline, trending-up-outline, trending-down-outline, analytics-outline',
          ),
        color: z
          .string()
          .describe(
            'Hex color code. Choose balanced colors that work on both dark and light themes. Available colors: #EF4444 (red), #F97316 (orange), #F59E0B (amber), #EAB308 (yellow), #84CC16 (lime), #22C55E (green), #10B981 (emerald), #14B8A6 (teal), #06B6D4 (cyan), #0EA5E9 (sky), #3B82F6 (blue), #6366F1 (indigo), #8B5CF6 (violet), #A855F7 (purple), #D946EF (fuchsia), #EC4899 (pink), #F43F5E (rose), #64748B (slate), #78716C (stone), #0F766E (dark teal), #15803D (dark green), #B45309 (dark amber), #9F1239 (dark rose), #4338CA (dark indigo), #7C3AED (vivid purple), #2563EB (vivid blue), #059669 (vivid emerald), #DC2626 (vivid red), #CA8A04 (dark yellow)',
          ),
      });

      const ClassificationSchema = z.object({
        categoryId: z
          .string()
          .nullable()
          .describe(
            'The ID of the best matching existing category, OR null if you need to create a new category.',
          ),
        newCategory: NewCategorySchema.nullable().describe(
          'ONLY if no existing category fits: provide name, icon, and color for a new category. Leave null if using an existing category.',
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
          .describe(
            'Brief explanation of why you chose this category or suggested a new one.',
          ),
      });

      // Format categories and tags using TOON format for token efficiency
      // TOON is optimized for uniform arrays of objects - exactly what we have here
      // Using tab delimiter for additional token savings (tabs tokenize more efficiently than commas)
      // Example output: categories[3\t]{id\tname}:\n  uuid1\tFinance\n  uuid2\tMedical
      const formattedCategories =
        categories.length > 0
          ? toonEncode({ categories }, { delimiter: '\t' }).trim()
          : '(No categories defined yet)';

      const formattedTags =
        tags.length > 0
          ? toonEncode({ tags }, { delimiter: '\t' }).trim()
          : '(No tags defined yet)';

      this.logger.debug(
        `Formatted categories (TOON): ${formattedCategories.substring(0, 200)}...`,
      );

      const prompt = `You are a document classifier for a personal document management system. Your job is to categorize documents into the user's existing folder structure, or suggest a new category when truly necessary.

${originalFileName ? `Original filename: "${originalFileName}"` : ''}

## USER'S EXISTING CATEGORIES (TOON format, tab-separated - [count]{fields}: then data rows):
\`\`\`toon
${formattedCategories}
\`\`\`

## USER'S TAGS (TOON format, tab-separated):
\`\`\`toon
${formattedTags}
\`\`\`

---

## YOUR TASK:

### 1. CATEGORY SELECTION (Choose ONE approach)

**APPROACH A: Use an existing category (PREFERRED - try this first!)**
Find the best matching existing category. Be creative with connections:
- Direct match: invoice → "Bills", course notes → "Lecture Notes"
- Semantic similarity: traffic fine → "Library Fines" (both are fines)
- Functional similarity: payment receipt → "Tuition & Fees" (both are payments)
- Catch-all: random document → "Student ID/Admin" or similar general category

**APPROACH B: Create a new category (ONLY as last resort)**
If the document truly doesn't fit ANY existing category even with creative matching:
- Set categoryId to null
- Provide newCategory object with:
  - name: Short, clear name (max 25 chars, 1-3 words)
  - icon: An Ionicons outline icon name (see the icon list in the schema)
  - color: A hex color from the allowed list (balanced for dark/light themes)

**STRICT RULES for new categories:**
- Only suggest a new category if NO existing category can work, even loosely
- Keep the name SHORT and GENERAL (reusable for similar documents)
- Match the user's language style (French categories → French names)
- Pick an icon that semantically matches the category content
- Pick a color that's visually distinct from common colors

**Icon selection guidance:**
- Financial docs → cash-outline, wallet-outline, card-outline, receipt-outline
- Medical → medkit-outline, heart-outline, fitness-outline
- Vehicle/Transport → car-outline, bus-outline, airplane-outline
- Legal/Admin → document-outline, clipboard-outline, shield-outline
- Home → home-outline, construct-outline, hammer-outline
- Education → school-outline, book-outline, library-outline
- Communication → mail-outline, chatbubbles-outline, megaphone-outline
- Tech → laptop-outline, phone-portrait-outline, cloud-outline

### 2. TITLE GENERATION
- Clear, descriptive title (max 60 characters)
- Include dates, amounts, key identifiers
- Use document's language
- Examples: "Facture EDF - Janvier 2024", "Amende routière - 135€"

### 3. TAG SELECTION
- Select ALL relevant tags from the existing list
- Be generous with tags
- Empty array [] is OK if none fit

---

## OUTPUT RULES:
1. For existing category: set categoryId to the ID, set newCategory to null
2. For new category: set categoryId to null, provide complete newCategory object (name, icon, color)
3. NEVER invent category IDs - only use IDs from the list above
4. Prefer existing categories over creating new ones (80% of documents should fit existing categories)
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

      // Determine newCategory from parsed response
      // Only use newCategory if AI explicitly asked to create a new category (categoryId is null)
      const newCategory =
        validatedCategoryId === null && parsed.newCategory
          ? {
              name: parsed.newCategory.name || 'New Category',
              icon: parsed.newCategory.icon || 'folder-outline',
              color: parsed.newCategory.color || '#6366F1',
            }
          : null;

      // If AI returned invalid ID and didn't suggest a new category, use fallback
      if (!validatedCategoryId && !newCategory && categories.length > 0) {
        validatedCategoryId = categories[0].id;
        this.logger.warn(
          `AI returned no valid category and no new category - using fallback: "${categories[0].name}" (${categories[0].id})`,
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
        `Validated Classification result: categoryId=${validatedCategoryId}, newCategory=${newCategory ? JSON.stringify(newCategory) : 'null'}, tagIds=${JSON.stringify(validatedTagIds)}, title="${parsed.title}"`,
      );

      return {
        categoryId: validatedCategoryId,
        newCategory,
        tagIds: validatedTagIds,
        title: parsed.title || originalFileName || 'Untitled Document',
      };
    } catch (error) {
      this.logger.error('AI Classification failed', error);
      // Return fallback result on failure - use first category if available
      return {
        categoryId: categories.length > 0 ? categories[0].id : null,
        newCategory: null,
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
      // Only use first 2000 chars as that's usually enough for title inference
      const truncatedContent =
        content.length > 2000 ? content.substring(0, 2000) : content;

      const TitleSchema = z.object({
        title: z
          .string()
          .max(60)
          .describe(
            'A concise, descriptive title for the document. MAXIMUM 60 characters. Must be short and human-readable.',
          ),
      });

      const prompt = `You are a document naming assistant. Generate a SHORT, descriptive title for this document.

${originalFileName ? `Original filename: "${originalFileName}"` : ''}

## CRITICAL RULES:
- Title MUST be 60 characters or less
- Title must be SHORT and CONCISE
- DO NOT include document content in the title
- DO NOT summarize the document - just NAME it

## Good title examples:
- "Train Ticket - Toulouse to Marseille"
- "Electricity Bill - January 2024"
- "Apartment Lease Agreement"
- "Car Insurance Policy"
- "Medical Test Results"
- "Restaurant Receipt - 15 Nov 2024"

## What to include:
- Document type (bill, ticket, contract, etc.)
- Key identifier (company name, date, location)
- Use the document's language

## What NOT to include:
- File extensions (.pdf, .jpg)
- Generic words like "Document" or "File"
- The actual content of the document
- Long descriptions or summaries`;

      const response = await this.client.chat.completions.create({
        model: 'accounts/fireworks/models/deepseek-v3p1-terminus',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `Document Content:\n${truncatedContent}` },
        ],
        response_format: zodResponseFormat(TitleSchema, 'title_generation'),
        temperature: 0.1,
        max_tokens: 150, // Limit response to prevent runaway generation
      });

      const result = response.choices[0].message.content;
      if (!result) {
        throw new Error('Empty response from AI model');
      }

      this.logger.debug(`Raw AI title response: ${result}`);

      const parsed = JSON.parse(result);

      // Ensure title is not too long (extra safety)
      let title = parsed.title || originalFileName || 'Untitled Document';
      if (title.length > 60) {
        title = title.substring(0, 57) + '...';
      }

      this.logger.log(`AI Title Generation - Title: "${title}"`);

      return { title };
    } catch (error) {
      this.logger.error('AI Title generation failed', error);
      return {
        title: originalFileName || 'Untitled Document',
      };
    }
  }
}

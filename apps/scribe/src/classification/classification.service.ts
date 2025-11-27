import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

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
  ): Promise<{ categoryId: string | null; tagIds: string[] }> {
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
      });

      const prompt = `
You are an intelligent document classifier.
Your task is to analyze the document content and assign the most appropriate category and tags from the provided lists.

Available Categories:
${JSON.stringify(categories, null, 2)}

Available Tags:
${JSON.stringify(tags, null, 2)}

Instructions:
1. Select ONE category that best fits the document. If no category fits well, return null.
2. Select ANY tags that apply to the document.
3. Return ONLY the IDs of the selected category and tags.
4. Do not invent new categories or tags.
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
        temperature: 0.1,
      });

      const result = response.choices[0].message.content;
      if (!result) {
        throw new Error('Empty response from AI model');
      }

      this.logger.debug(`Raw AI response: ${result}`);

      const parsed = JSON.parse(result);

      this.logger.log(`AI Classification result: ${JSON.stringify(parsed)}`);

      return {
        categoryId: parsed.categoryId,
        tagIds: parsed.tagIds,
      };
    } catch (error) {
      this.logger.error('AI Classification failed', error);
      // Return neutral result on failure so processing can continue
      return { categoryId: null, tagIds: [] };
    }
  }
}

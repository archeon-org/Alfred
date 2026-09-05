/** Presentation models only. These are not API or agent contracts. */
export interface MessageView {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly paragraphs: readonly string[];
  readonly highlights?: readonly string[];
}

export interface ResourceView {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
  readonly format: 'PDF' | 'MD';
}

export interface ConversationView {
  readonly id: string;
  readonly projectId?: string;
  readonly title: string;
  readonly group: 'Aujourd’hui' | 'Hier';
  readonly category: string;
  readonly messages: readonly MessageView[];
  readonly resources: readonly ResourceView[];
}

export interface ProjectView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export type WorkspaceCreationKind = 'project' | 'conversation' | 'sandbox';

export interface StarterPrompt {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: 'synthesize' | 'explore' | 'plan';
  readonly conversationId: string;
}

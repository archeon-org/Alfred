/** View-side types. Projects and conversations come straight from the shared API contracts. */
export type { Conversation, Project } from '@alfred/contracts';

export interface ResourceView {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
  readonly format: 'PDF' | 'MD';
}

export type WorkspaceCreationKind = 'project' | 'conversation' | 'sandbox';

export interface StarterPrompt {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: 'synthesize' | 'explore' | 'plan';
  /** Text placed in the composer of the chat created from this starter. */
  readonly prompt: string;
}

/** What the header and context panel say about the current location. */
export interface WorkspaceScope {
  readonly projectName?: string;
  readonly conversationTitle?: string;
}

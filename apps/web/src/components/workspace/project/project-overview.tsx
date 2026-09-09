import { FolderOpen, Pencil, Trash2 } from 'lucide-react';
import type { Ref } from 'react';

import { IconButton } from '@/components/ui/icon-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ProjectChatComposer,
  type ProjectChatComposerProps,
} from '@/components/workspace/project/project-chat-composer';
import {
  ProjectChatList,
  type ProjectChatListProps,
} from '@/components/workspace/project/project-chat-list';
import {
  ProjectSources,
  type ProjectDocumentKey,
} from '@/components/workspace/project/project-sources';
import { markdownToText } from '@/lib/markdown/parse-markdown';
import type { Project } from '@/lib/workspace/workspace.types';

interface ProjectOverviewProps {
  readonly ref: Ref<HTMLElement>;
  readonly project: Project;
  readonly chats: ProjectChatListProps;
  readonly composer: Omit<ProjectChatComposerProps, 'projectName'>;
  readonly isBusy: boolean;
  readonly onRename: () => void;
  readonly onDelete: () => void;
  readonly onEditDocument: (document: ProjectDocumentKey) => void;
}

/** Project home: a chat input on top, then the project's chats and its Markdown sources. */
export function ProjectOverview({
  chats,
  composer,
  isBusy,
  onDelete,
  onEditDocument,
  onRename,
  project,
  ref,
}: ProjectOverviewProps) {
  const name = project.name ?? 'Projet';
  const summary = project.description === null ? '' : markdownToText(project.description, 160);
  return (
    <main
      className="flex h-full min-h-0 min-w-0 outline-none focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-ring"
      id="main-content"
      ref={ref}
      tabIndex={-1}
    >
      <section
        aria-busy={isBusy}
        aria-labelledby="project-title"
        className="flex min-h-170 w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-panel md:rounded-2xl workspace:min-h-0 workspace:overflow-y-auto [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
        id="conversation"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-4 md:px-6 md:py-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-muted text-muted-foreground">
            <FolderOpen aria-hidden="true" size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-2xs font-semibold tracking-label text-muted-foreground">
              PROJET
            </p>
            <h1
              className="text-base font-semibold tracking-tight wrap-anywhere md:text-lg"
              id="project-title"
            >
              {name}
            </h1>
            {summary !== '' ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground wrap-anywhere">
                {summary}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton label="Renommer le projet" onClick={onRename} size="icon-sm">
              <Pencil aria-hidden="true" size={16} />
            </IconButton>
            <IconButton
              className="hover:text-destructive"
              label="Supprimer le projet"
              onClick={onDelete}
              size="icon-sm"
            >
              <Trash2 aria-hidden="true" size={16} />
            </IconButton>
          </div>
        </header>
        <div className="mx-auto w-full max-w-conversation px-4 pt-5 md:px-6 wide:px-8">
          <ProjectChatComposer projectName={name} {...composer} />
        </div>
        <Tabs
          className="mx-auto w-full max-w-conversation px-4 pt-6 pb-6 md:px-6 wide:px-8"
          defaultValue="chats"
        >
          <TabsList aria-label="Contenu du projet">
            <TabsTrigger value="chats">
              Chats
              <span className="text-2xs text-muted-foreground">{chats.conversations.length}</span>
            </TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
          </TabsList>
          <TabsContent className="pt-4" value="chats">
            <ProjectChatList {...chats} />
          </TabsContent>
          <TabsContent className="pt-4" value="sources">
            <ProjectSources
              context={project.context}
              description={project.description}
              onEdit={onEditDocument}
            />
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
}

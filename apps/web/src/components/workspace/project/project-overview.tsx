import { FolderOpen, Pin } from 'lucide-react';
import type { Ref } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ProjectActionMenu,
  type ProjectActionHandlers,
} from '@/components/workspace/project/project-action-menu';
import {
  ProjectChatComposer,
  type ProjectChatComposerProps,
} from '@/components/workspace/project/project-chat-composer';
import {
  ProjectChatList,
  type ProjectChatListProps,
} from '@/components/workspace/project/project-chat-list';
import { ProjectSources } from '@/components/workspace/project/project-sources';
import type { Project } from '@/lib/workspace/workspace.types';

interface ProjectOverviewProps {
  readonly ref: Ref<HTMLElement>;
  readonly project: Project;
  readonly chats: ProjectChatListProps;
  readonly composer: Omit<ProjectChatComposerProps, 'projectName'>;
  readonly actions: ProjectActionHandlers;
  readonly isBusy: boolean;
  readonly notice?: string | null;
}

/** Project home: a chat input on top, then the project's chats and its Markdown sources. */
export function ProjectOverview({
  actions,
  chats,
  composer,
  isBusy,
  notice,
  project,
  ref,
}: ProjectOverviewProps) {
  const name = project.name ?? 'Projet';
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
        data-conversation-scroll-root
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-4 md:px-6 md:py-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-muted text-muted-foreground">
            <FolderOpen aria-hidden="true" size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="mb-1 flex items-center gap-1.5 text-2xs font-semibold tracking-label text-muted-foreground">
              PROJET
              {project.pinnedAt !== null ? (
                <span className="inline-flex items-center gap-1 rounded border border-border px-1 py-px font-medium tracking-normal normal-case">
                  <Pin aria-hidden="true" size={10} />
                  Épinglé
                </span>
              ) : null}
            </p>
            <h1
              className="text-base font-semibold tracking-tight wrap-anywhere md:text-lg"
              id="project-title"
            >
              {name}
            </h1>
          </div>
          <ProjectActionMenu
            className="shrink-0"
            onDelete={actions.onDelete}
            onRename={actions.onRename}
            onTogglePin={actions.onTogglePin}
            project={project}
            size="icon"
          />
        </header>
        {notice ? (
          <p
            className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive md:mx-6"
            role="alert"
          >
            {notice}
          </p>
        ) : null}
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
            <TabsTrigger value="sources">Contexte</TabsTrigger>
          </TabsList>
          <TabsContent className="pt-4" value="chats">
            <ProjectChatList {...chats} />
          </TabsContent>
          <TabsContent forceMount className="pt-4 data-[state=inactive]:hidden" value="sources">
            <ProjectSources key={project.id} projectId={project.id} />
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
}

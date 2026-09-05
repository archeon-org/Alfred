import { useState } from 'react';

import type {
  ConversationView,
  WorkspaceCreationKind,
  ProjectView,
} from '@/lib/workspace/workspace.types';
import { previewConversations, previewProjects, starterPrompts } from '@/mock/workspace';

/** In-memory preview state only; these operations do not invoke product services. */
export function useWorkspacePreview() {
  const [model, setModel] = useState<{
    readonly projects: readonly ProjectView[];
    readonly conversations: readonly ConversationView[];
    readonly selectedId: string | null;
    readonly selectedProjectId: string | null;
  }>({
    projects: previewProjects,
    conversations: previewConversations,
    selectedId: null,
    selectedProjectId: 'portal',
  });
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isContextOpen, setIsContextOpen] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const conversation = model.conversations.find(({ id }) => id === model.selectedId);
  const selectedProject = model.projects.find(({ id }) => id === model.selectedProjectId);
  const normalizedSearch = search.trim().toLocaleLowerCase('fr');
  const conversations = model.conversations.filter(({ title }) =>
    title.toLocaleLowerCase('fr').includes(normalizedSearch),
  );

  function selectConversation(id: string) {
    const selected = model.conversations.find((item) => item.id === id);
    if (!selected) return;
    setModel((previous) => ({
      ...previous,
      selectedId: id,
      selectedProjectId: selected.projectId ?? null,
    }));
    setIsNavigationOpen(false);
  }

  function selectProject(id: string) {
    setModel((previous) => ({ ...previous, selectedId: null, selectedProjectId: id }));
  }

  function createItem(kind: WorkspaceCreationKind, title: string) {
    const name = title.trim();
    if (!name || name.length > (kind === 'project' ? 80 : 120)) return false;
    const id = crypto.randomUUID();
    if (kind === 'project') {
      setModel((previous) => ({
        ...previous,
        projects: [
          ...previous.projects,
          { id, name, description: 'Projet local de démonstration.' },
        ],
        selectedProjectId: id,
        selectedId: null,
      }));
    } else {
      setModel((previous) => {
        const projectId = kind === 'conversation' ? previous.selectedProjectId : null;
        const entry: ConversationView = {
          id,
          title: name,
          ...(projectId ? { projectId } : {}),
          group: 'Aujourd’hui',
          category: projectId ? 'Projet' : 'Sandbox',
          messages: [],
          resources: [],
        };
        return {
          ...previous,
          conversations: [...previous.conversations, entry],
          selectedId: id,
          selectedProjectId: projectId,
        };
      });
    }
    setSearch('');
    setIsNavigationOpen(false);
    return true;
  }

  return {
    conversation,
    conversations,
    projects: model.projects,
    selectedProject,
    starterPrompts,
    search,
    setSearch,
    isLoading,
    isContextOpen,
    isSidebarOpen,
    isNavigationOpen,
    selectConversation,
    selectProject,
    createItem,
    setIsSidebarOpen,
    toggleLoading: () => setIsLoading((value) => !value),
    toggleContext: () => setIsContextOpen((value) => !value),
    toggleNavigation: () => setIsNavigationOpen((value) => !value),
  };
}

import type { AgentView, SkillView, TeamView } from '@/lib/workspace/workspace-tools.types';

export const previewAgents: readonly AgentView[] = [
  {
    id: 'analyst',
    name: 'Analyste',
    description: 'Structure les idées et les informations.',
    initials: 'AN',
  },
  {
    id: 'writer',
    name: 'Rédacteur',
    description: 'Donne une forme claire à vos idées.',
    initials: 'RE',
  },
  {
    id: 'researcher',
    name: 'Éclaireur',
    description: 'Explore les questions et les pistes.',
    initials: 'EC',
  },
];

export const previewTeams: readonly TeamView[] = [
  {
    id: 'editorial',
    name: 'Atelier éditorial',
    description: 'De l’idée à une synthèse claire.',
    memberIds: ['analyst', 'writer'],
  },
  {
    id: 'research',
    name: 'Exploration',
    description: 'Un autre regard sur vos sujets.',
    memberIds: ['researcher', 'analyst'],
  },
];

export const previewSkills: readonly SkillView[] = [
  { id: 'synthesis', name: 'Synthèse', description: 'Faire ressortir les idées essentielles.' },
  { id: 'writing', name: 'Rédaction', description: 'Adapter le ton et la structure.' },
  { id: 'planning', name: 'Planification', description: 'Organiser un objectif en étapes.' },
];

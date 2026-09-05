import type { ConversationView, ProjectView, StarterPrompt } from '@/lib/workspace/workspace.types';

export const previewProjects: readonly ProjectView[] = [
  {
    id: 'portal',
    name: 'Refonte du portail',
    description: 'Un espace pour penser la prochaine version.',
  },
  {
    id: 'research',
    name: 'Veille & recherche',
    description: 'Explorer, comparer et garder les idées utiles.',
  },
];

/** Static, fictional content. No persistence, generated response or document access. */
export const previewConversations: readonly ConversationView[] = [
  {
    id: 'project-summary',
    projectId: 'portal',
    title: 'Synthèse du comité projet',
    group: 'Aujourd’hui',
    category: 'Synthèse',
    messages: [
      {
        id: 'summary-request',
        role: 'user',
        paragraphs: [
          'Peux-tu m’aider à structurer la synthèse du dernier comité projet ? Je voudrais faire ressortir les décisions et les prochaines étapes.',
        ],
      },
      {
        id: 'summary-reply',
        role: 'assistant',
        paragraphs: [
          'Voici une proposition de structure pour une synthèse claire et facile à partager.',
          'L’essentiel tient en trois points :',
        ],
        highlights: [
          'Le cap : conserver les objectifs du projet et préciser les priorités du prochain cycle.',
          'Les décisions : distinguer ce qui est validé de ce qui reste à arbitrer.',
          'La suite : associer chaque action à un responsable et à une échéance.',
        ],
      },
    ],
    resources: [
      {
        id: 'brief',
        name: 'Note de cadrage',
        detail: 'Document d’exemple · 4 pages',
        format: 'PDF',
      },
      {
        id: 'notes',
        name: 'Notes du comité',
        detail: 'Document d’exemple · 2 pages',
        format: 'MD',
      },
    ],
  },
  {
    id: 'research',
    projectId: 'portal',
    title: 'Explorer une nouvelle idée',
    group: 'Aujourd’hui',
    category: 'Exploration',
    messages: [
      {
        id: 'research-request',
        role: 'user',
        paragraphs: ['Comment explorer une idée avant de lancer un projet ?'],
      },
      {
        id: 'research-reply',
        role: 'assistant',
        paragraphs: [
          'Commençons par poser les bonnes questions. Une exploration utile peut rester simple.',
        ],
        highlights: [
          'Quel problème cherchez-vous à résoudre, et pour qui ?',
          'Quelles hypothèses peut-on vérifier rapidement ?',
          'Quel petit essai permettrait d’apprendre le plus ?',
        ],
      },
    ],
    resources: [],
  },
  {
    id: 'weekly-plan',
    title: 'Préparer la semaine à venir',
    group: 'Hier',
    category: 'Organisation',
    messages: [
      {
        id: 'plan-request',
        role: 'user',
        paragraphs: ['Aide-moi à préparer un plan de travail simple pour la semaine.'],
      },
      {
        id: 'plan-reply',
        role: 'assistant',
        paragraphs: ['Voici une trame à adapter à vos priorités.'],
        highlights: [
          'Lundi : faire le point et choisir trois résultats attendus.',
          'Mardi à jeudi : réserver du temps pour avancer sur chaque priorité.',
          'Vendredi : partager les résultats et préparer la suite.',
        ],
      },
    ],
    resources: [],
  },
];

export const starterPrompts: readonly StarterPrompt[] = [
  {
    id: 'synthesize',
    title: 'Aller à l’essentiel',
    description: 'Faire émerger les idées clés.',
    kind: 'synthesize',
    conversationId: 'project-summary',
  },
  {
    id: 'explore',
    title: 'Ouvrir des pistes',
    description: 'Donner de l’espace à une idée.',
    kind: 'explore',
    conversationId: 'research',
  },
  {
    id: 'plan',
    title: 'Passer à la suite',
    description: 'Organiser les prochaines étapes.',
    kind: 'plan',
    conversationId: 'weekly-plan',
  },
];

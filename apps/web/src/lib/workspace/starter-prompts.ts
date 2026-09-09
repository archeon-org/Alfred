import type { StarterPrompt } from '@/lib/workspace/workspace.types';

/** Static starting points. Choosing one creates a real chat; sending still awaits the runtime. */
export const starterPrompts: readonly StarterPrompt[] = [
  {
    description: 'Faire émerger les idées clés.',
    id: 'synthesize',
    kind: 'synthesize',
    prompt: 'Aide-moi à synthétiser ce sujet et à en dégager les points clés.',
    title: 'Aller à l’essentiel',
  },
  {
    description: 'Donner de l’espace à une idée.',
    id: 'explore',
    kind: 'explore',
    prompt: 'Explorons une idée : aide-moi à poser les bonnes questions avant de me lancer.',
    title: 'Ouvrir des pistes',
  },
  {
    description: 'Organiser les prochaines étapes.',
    id: 'plan',
    kind: 'plan',
    prompt: 'Aide-moi à organiser les prochaines étapes et à les répartir dans le temps.',
    title: 'Passer à la suite',
  },
];

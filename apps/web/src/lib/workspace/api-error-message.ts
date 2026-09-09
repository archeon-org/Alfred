import { PROJECT_PIN_LIMIT } from '@alfred/contracts';

import { ApiRequestError } from '@/services/http/api-json';

const MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  HTTP_401: 'Votre session a expiré. Reconnectez-vous pour continuer.',
  HTTP_429: 'Trop de requêtes. Réessayez dans un instant.',
  conversation_move_not_allowed: 'Seul un chat libre peut être ajouté à un projet actif.',
  conversation_source_has_context:
    'Ce chat contient un contexte ou d’autres données. Son déplacement est impossible sans les préserver.',
  conversation_not_found: 'Cette conversation n’existe plus.',
  invalid_name: 'Le nom est invalide.',
  invalid_update: 'Aucune modification à enregistrer.',
  project_archived: 'Ce projet est archivé.',
  project_deleting: 'Ce projet est en cours de suppression.',
  project_implicit: 'Convertissez d’abord ce chat en projet.',
  project_not_found: 'Ce projet n’existe plus.',
  project_pin_limit_reached: `Vous avez atteint la limite de ${PROJECT_PIN_LIMIT} projets épinglés. Désépinglez-en un pour continuer.`,
});

/** Human-readable French message for a failed workspace request. */
export function describeApiError(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 400) return 'Les informations saisies sont invalides.';
    return MESSAGES[error.code] ?? fallback;
  }
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  return fallback;
}

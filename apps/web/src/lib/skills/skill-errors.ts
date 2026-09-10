import { ApiRequestError } from '@/services/http/api-json';

export function skillError(reason: unknown): string {
  if (reason instanceof ApiRequestError) {
    if (reason.code === 'skill_package_invalid') return reason.message;
    if (reason.code === 'skill_version_conflict')
      return 'Ce skill a été modifié ailleurs. Votre brouillon est conservé. Exportez-le avant de recharger la version enregistrée.';
    if (reason.code === 'skill_name_conflict')
      return 'Ce nom est déjà utilisé. Choisissez un autre nom.';
    if (reason.code === 'skill_storage_quota_exceeded')
      return 'Votre espace de skills est plein. L’historique conservé compte aussi dans votre quota. Supprimez des skills inutilisés avant de réessayer.';
    if (reason.status === 413) return 'Le package dépasse la taille autorisée.';
    if (reason.status === 400) return 'Vérifiez le nom, la description et les fichiers du skill.';
    if (reason.status === 404) return 'Ce skill n’est plus disponible. Actualisez le catalogue.';
  }
  return 'Impossible de terminer cette action. Votre brouillon est conservé. Réessayez.';
}
export function downloadSkill(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name || 'skill'}.${blob.type.includes('zip') ? 'zip' : 'md'}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

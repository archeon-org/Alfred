import { ContextDocuments } from '@/components/workspace/personalization/context-documents';

export function ProjectSources({ projectId }: { readonly projectId: string }) {
  return <ContextDocuments scope={{ type: 'project', projectId }} />;
}

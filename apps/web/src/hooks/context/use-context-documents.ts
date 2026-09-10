import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ContextDocument,
  ContextDocumentSet,
  SaveContextDocumentInput,
} from '@alfred/contracts';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import {
  contextPath,
  getContextDocuments,
  saveContextDocument,
  type ContextScope,
} from '@/services/context/context.service';

export function useContextDocuments(scope: ContextScope) {
  const { client, userId } = useWorkspaceAccount();
  const cache = useQueryClient();
  const queryKey = ['context-documents', userId, contextPath(scope)];
  const query = useQuery({ queryKey, queryFn: () => getContextDocuments(client, scope) });
  const mutation = useMutation({
    mutationFn: ({
      kind,
      input,
    }: {
      kind: ContextDocument['kind'];
      input: SaveContextDocumentInput;
    }) => saveContextDocument(client, scope, kind, input),
    onSuccess: (document) =>
      cache.setQueryData<ContextDocumentSet>(queryKey, (previous) =>
        previous === undefined
          ? previous
          : {
              ...previous,
              documents: previous.documents.map((item) =>
                item.kind === document.kind ? document : item,
              ),
            },
      ),
  });
  return { query, save: mutation.mutateAsync };
}

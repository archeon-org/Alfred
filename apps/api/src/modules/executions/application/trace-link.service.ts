import { executionTraceLinkSchema, type ExecutionTraceLink } from '@alfred/contracts';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { ApiException } from '../../../common/errors/api.exception';
import { buildTraceUrl } from '../../../config/trace-link';
import { ExecutionsService } from './executions.service';

/**
 * Development diagnostic (ALF-DEC-008 observability-only trace): links an execution the caller
 * may observe to its trace in the runtime's console. The runtime run id leaves the API only here,
 * inside a URL, while `traceLinks` is enabled; it is never part of the execution contract.
 */
@Injectable()
export class TraceLinkService {
  constructor(
    private readonly executions: ExecutionsService,
    private readonly config: ConfigService,
  ) {}

  async linkFor(principal: AuthPrincipal, executionId: string): Promise<ExecutionTraceLink> {
    const row = await this.executions.getObservation(principal, executionId);
    if (row.runtimeRunId === null) {
      throw new ApiException(404, 'trace_unavailable', 'This execution has no runtime trace.');
    }
    const url = buildTraceUrl({
      uiUrl: this.config.getOrThrow<string>('TRACE_LINK_UI_URL'),
      organizationId: this.config.getOrThrow<string>('TRACE_LINK_ORGANIZATION_ID'),
      projectId: this.config.getOrThrow<string>('TRACE_LINK_PROJECT_ID'),
      runId: row.runtimeRunId,
    });
    // Startup already reserved room for the widest run identifier; the contract is the last word.
    const link = executionTraceLinkSchema.safeParse({ url });
    if (!link.success) {
      throw new ApiException(
        500,
        'trace_link_invalid',
        'The trace link of this execution does not satisfy the contract.',
      );
    }
    return link.data;
  }
}

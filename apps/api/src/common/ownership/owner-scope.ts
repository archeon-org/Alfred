/**
 * Server-derived authorization scope for tenant-rooted resources (ALF-DEC-004/055).
 * Both identifiers come from trusted product state, never from the browser.
 */
export interface OwnerScope {
  readonly tenantId: string;
  readonly ownerUserId: string;
}

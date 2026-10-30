export interface OwnedSyncItem {
  userId: string;
  payload: Record<string, unknown>;
}

export function assertSyncItemsOwnedBy(items: OwnedSyncItem[], userId: string): void {
  const foreignOwner = items.some((item) =>
    item.userId !== userId ||
    (typeof item.payload.userId === 'string' && item.payload.userId !== userId)
  );
  if (foreignOwner) throw new Error('SYNC_USER_MISMATCH');
}

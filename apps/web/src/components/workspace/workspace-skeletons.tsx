import { Skeleton } from '@/components/ui/skeleton';

export function HistorySkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid gap-4 px-2.5 py-4 [&_[data-slot=skeleton]]:bg-sidebar-accent"
    >
      <Skeleton className="w-20" />
      {[0, 1, 2, 3].map((id) => (
        <Skeleton className="h-10 w-full" key={id} />
      ))}
    </div>
  );
}

export function ConversationSkeleton() {
  return (
    <div aria-hidden="true" className="flex w-full flex-col gap-4.5 px-5 py-8 md:p-10">
      <Skeleton className="ml-auto h-20 w-3/4 rounded-2xl" />
      <Skeleton className="size-10 rounded-xl" />
      <Skeleton className="w-3/4" />
      <Skeleton className="w-full" />
      <Skeleton className="w-5/6" />
      <div className="grid grid-cols-3 gap-3 pt-5">
        {[0, 1, 2].map((id) => (
          <Skeleton className="h-28 rounded-2xl" key={id} />
        ))}
      </div>
    </div>
  );
}

export function ContextSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="mt-8 w-24" />
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="mt-8 w-24" />
      <Skeleton className="w-full" />
      <Skeleton className="w-2/3" />
    </div>
  );
}

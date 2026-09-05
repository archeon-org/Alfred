import { cn } from '../../lib/cn';

interface AvatarProps {
  readonly className?: string;
  readonly name: string;
}

export function Avatar({ className, name }: AvatarProps) {
  const initials = name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.at(0)?.toLocaleUpperCase('fr'))
    .join('');

  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800',
        className,
      )}
    >
      {initials || 'A'}
    </span>
  );
}

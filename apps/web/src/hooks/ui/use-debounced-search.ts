import { useEffect, useState } from 'react';

export const SEARCH_DEBOUNCE_MS = 300;

/** Keep typing immediate while limiting search requests to settled, trimmed input. */
export function useDebouncedSearch() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);
  return { input, search, setInput };
}

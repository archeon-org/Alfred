import { useEffect, useState } from 'react';

/** Keep typing immediate while limiting catalogue requests to settled input. */
export function useCatalogueSearch() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);
  return { input, search, setInput };
}

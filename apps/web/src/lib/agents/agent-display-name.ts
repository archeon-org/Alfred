/**
 * Turns a runtime graph name into a readable label: separators become spaces and the first letter
 * is capitalised, while inner casing (acronyms such as `LightRAG`, `HTTP`) is kept.
 * `base_react_basic` → `Base react basic`, `CFTAgent_LightRAG_HTTP` → `CFTAgent LightRAG HTTP`.
 */
export function agentDisplayName(name: string): string {
  const label = name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (label.length === 0) return name;
  return label.charAt(0).toLocaleUpperCase('fr') + label.slice(1);
}

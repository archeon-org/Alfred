import type { HighlighterCore, ThemedToken } from 'shiki/core';

/** Grammars bundled on demand: one dynamic import per language, only when a block asks for it. */
const GRAMMARS = {
  bash: () => import('@shikijs/langs/bash'),
  css: () => import('@shikijs/langs/css'),
  diff: () => import('@shikijs/langs/diff'),
  dockerfile: () => import('@shikijs/langs/dockerfile'),
  go: () => import('@shikijs/langs/go'),
  html: () => import('@shikijs/langs/html'),
  java: () => import('@shikijs/langs/java'),
  javascript: () => import('@shikijs/langs/javascript'),
  json: () => import('@shikijs/langs/json'),
  jsx: () => import('@shikijs/langs/jsx'),
  markdown: () => import('@shikijs/langs/markdown'),
  mermaid: () => import('@shikijs/langs/mermaid'),
  python: () => import('@shikijs/langs/python'),
  rust: () => import('@shikijs/langs/rust'),
  sql: () => import('@shikijs/langs/sql'),
  toml: () => import('@shikijs/langs/toml'),
  tsx: () => import('@shikijs/langs/tsx'),
  typescript: () => import('@shikijs/langs/typescript'),
  yaml: () => import('@shikijs/langs/yaml'),
} as const;

const ALIASES: Readonly<Record<string, keyof typeof GRAMMARS>> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  yml: 'yaml',
  md: 'markdown',
  docker: 'dockerfile',
  htm: 'html',
  rs: 'rust',
};

/** Code larger than this stays plain: tokenising is main-thread work. */
export const HIGHLIGHT_SOURCE_LIMIT = 30_000;
export const THEME = 'alfred-css-variables';

export type HighlightedLine = readonly Pick<ThemedToken, 'content' | 'color' | 'fontStyle'>[];

let highlighter: Promise<HighlighterCore> | undefined;
const loaded = new Set<string>();
const loading = new Map<string, Promise<void>>();

/** The grammar id behind a fence label, or null when Alfred has no grammar for it. */
export function grammarFor(language: string | null): keyof typeof GRAMMARS | null {
  if (language === null) return null;
  const id = language.toLowerCase();
  if (id in GRAMMARS) return id as keyof typeof GRAMMARS;
  return ALIASES[id] ?? null;
}

async function core(): Promise<HighlighterCore> {
  highlighter ??= (async () => {
    // Oniguruma (WebAssembly, fetched on first use) tokenises identically in every browser; the
    // JavaScript regex engine left WebKit with whole lines as one token on TypeScript grammars.
    const [{ createHighlighterCore, createCssVariablesTheme }, { createOnigurumaEngine }] =
      await Promise.all([import('shiki/core'), import('shiki/engine/oniguruma')]);
    return createHighlighterCore({
      // The colours are CSS variables from the app theme; no theme JSON ships in the bundle.
      themes: [
        createCssVariablesTheme({ name: THEME, variablePrefix: '--shiki-', fontStyle: true }),
      ],
      langs: [],
      engine: createOnigurumaEngine(import('shiki/wasm')),
    });
  })();
  return highlighter;
}

async function ensureLanguage(id: keyof typeof GRAMMARS): Promise<HighlighterCore> {
  const instance = await core();
  if (!loaded.has(id)) {
    let pending = loading.get(id);
    if (pending === undefined) {
      pending = instance.loadLanguage(GRAMMARS[id]()).then(() => {
        loaded.add(id);
        loading.delete(id);
      });
      loading.set(id, pending);
    }
    await pending;
  }
  return instance;
}

/**
 * Tokens of a code block, line by line, each carrying a CSS-variable colour; null when the
 * language is unknown, the source too large or the grammar cannot tokenise it.
 */
export async function highlight(
  code: string,
  language: string | null,
): Promise<readonly HighlightedLine[] | null> {
  const id = grammarFor(language);
  if (id === null || code.length > HIGHLIGHT_SOURCE_LIMIT) return null;
  try {
    const instance = await ensureLanguage(id);
    return instance
      .codeToTokensBase(code, { lang: id, theme: THEME })
      .map((line) => line.map(({ content, color, fontStyle }) => ({ content, color, fontStyle })));
  } catch {
    return null;
  }
}

import { Code, LoaderCircle } from 'lucide-react';
import type { Mermaid } from 'mermaid';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { drawDiagram } from '@/lib/markdown/mermaid-render';
import { scrubExternalReferences } from '@/lib/markdown/svg-scrub';

interface MermaidDiagramProps {
  readonly source: string;
  /** The source fallback, already rendered by the caller as a plain code block. */
  readonly fallback: React.ReactNode;
}

/** Diagrams longer than this are shown as source: rendering is main-thread work. */
export const MERMAID_SOURCE_LIMIT = 20_000;
/**
 * Constructs that make Mermaid load a resource while it measures the diagram in the live DOM,
 * before any post-render scrubbing could act: image shapes, CSS `url(...)`/`@import`, theme CSS,
 * embedded HTML media and resource attributes. Such a source is shown, never drawn. This is the
 * cheap first look at the text; the parsed diagram is inspected again before drawing
 * (`drawDiagram`), where the spelling of a key no longer matters.
 */
const EXTERNAL_SOURCE =
  /url\s*\(|@import|themeCSS|<\s*(?:img|iframe|object|embed|video|audio|link|script|foreignobject)\b|\b(?:img|image)\s*:|\bsrc\s*=|xlink:/iu;

/** Whether a diagram source asks, in so many words, for anything the renderer would have to fetch. */
export function referencesExternalContent(source: string): boolean {
  return EXTERNAL_SOURCE.test(source);
}
const TOKENS = [
  'background',
  'foreground',
  'card',
  'primary',
  'primary-foreground',
  'muted',
  'muted-foreground',
  'border',
] as const;

let loading: Promise<Mermaid> | undefined;
let sequence = 0;

/** One shared instance; the diagram code is only fetched when a diagram first appears. */
function loadMermaid(): Promise<Mermaid> {
  loading ??= import('mermaid').then((module) => module.default);
  return loading;
}

type Token = (typeof TOKENS)[number];

/** Theme variables from the app tokens as they stand right now (light, dark, accent). */
function themeVariables(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  const colors = {} as Record<Token, string>;
  for (const name of TOKENS) colors[name] = style.getPropertyValue(`--${name}`).trim();
  return {
    background: colors.background,
    mainBkg: colors.card,
    primaryColor: colors.muted,
    primaryTextColor: colors.foreground,
    primaryBorderColor: colors.primary,
    secondaryColor: colors.card,
    tertiaryColor: colors.background,
    lineColor: colors['muted-foreground'],
    textColor: colors.foreground,
    nodeBorder: colors.primary,
    clusterBkg: colors.background,
    clusterBorder: colors.border,
    titleColor: colors.foreground,
    edgeLabelBackground: colors.card,
    actorBkg: colors.muted,
    actorBorder: colors.primary,
    actorTextColor: colors.foreground,
    signalColor: colors.foreground,
    signalTextColor: colors.foreground,
    labelBoxBkgColor: colors.muted,
    labelTextColor: colors.foreground,
    noteBkgColor: colors.muted,
    noteTextColor: colors.foreground,
    noteBorderColor: colors.border,
    fontFamily: style.getPropertyValue('--font-sans').trim() || 'sans-serif',
  };
}

type State = 'pending' | 'ready' | 'error' | 'external';

const TOO_LONG = 'Diagramme trop long pour être dessiné ici : la source est affichée.';
const EXTERNAL =
  'Diagramme non dessiné : il référence des images ou des ressources externes, qui ne sont jamais chargées. La source est affichée.';

/**
 * Renders a Mermaid diagram from a completed fence. The SVG is produced under Mermaid's strict
 * security level (sanitized, no HTML labels, no click bindings, directives unable to touch the
 * theme or CSS), only after the parsed diagram proved to load nothing, and adopted as DOM nodes,
 * never as an HTML string. A syntax error, an oversized source or a failed load fall back to the
 * source.
 */
export function MermaidDiagram({ source, fallback }: MermaidDiagramProps) {
  const id = useId().replaceAll(':', '');
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>('pending');
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [scrubbed, setScrubbed] = useState(0);
  const [theme, setTheme] = useState(0);
  const tooLong = source.length > MERMAID_SOURCE_LIMIT;
  const externalSource = referencesExternalContent(source);

  useEffect(() => {
    // Re-render with the new palette when the person switches theme or accent.
    const observer = new MutationObserver(() => setTheme((value) => value + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-accent'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (tooLong || externalSource) return;
    let cancelled = false;
    const render = async () => {
      try {
        const mermaid = await loadMermaid();
        if (cancelled) return;
        // A new source or palette redraws from the pending state, after the module is at hand.
        setState('pending');
        sequence += 1;
        const result = await drawDiagram(mermaid, `mermaid-${id}-${sequence}`, source, {
          startOnLoad: false,
          securityLevel: 'strict',
          suppressErrorRendering: true,
          // Labels stay SVG text: no HTML, hence no <img>, <iframe> or CSS background fetch.
          htmlLabels: false,
          flowchart: { htmlLabels: false },
          theme: 'base',
          themeVariables: themeVariables(),
          fontFamily: themeVariables().fontFamily,
        });
        if (cancelled) return;
        if ('external' in result) {
          setState('external');
          return;
        }
        if (host.current === null) return;
        const parsed = new DOMParser().parseFromString(result.svg, 'image/svg+xml');
        const root = parsed.documentElement;
        if (root.tagName.toLowerCase() !== 'svg') throw new Error('Rendu inattendu.');
        // Nothing in a diagram may reach the network: images, embedded documents, external refs.
        const removed = scrubExternalReferences(root);
        root.removeAttribute('height');
        root.style.maxWidth = '100%';
        root.style.height = 'auto';
        root.setAttribute('role', 'img');
        host.current.replaceChildren(document.importNode(root, true));
        setScrubbed(removed);
        setError(null);
        setState('ready');
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'Diagramme invalide.');
        setState('error');
      }
    };
    void render();
    return () => {
      cancelled = true;
    };
  }, [id, source, theme, tooLong, externalSource]);

  if (tooLong || externalSource) {
    return (
      <div data-slot="mermaid-diagram" data-state={tooLong ? 'error' : 'external'}>
        <p className="mb-2 text-xs text-muted-foreground" role="status">
          {tooLong ? TOO_LONG : EXTERNAL}
        </p>
        {fallback}
      </div>
    );
  }
  return (
    <div data-slot="mermaid-diagram" data-state={state}>
      {state === 'external' ? (
        <p className="mb-2 text-xs text-muted-foreground" role="status">
          {EXTERNAL}
        </p>
      ) : null}
      {state === 'error' ? (
        <p className="mb-2 text-xs text-destructive" role="alert">
          Le diagramme n’a pas pu être dessiné{error ? ` : ${error.split('\n')[0]}` : ''}. La source
          est affichée.
        </p>
      ) : null}
      {state === 'ready' && scrubbed > 0 ? (
        <p className="mb-2 text-xs text-muted-foreground" role="status">
          Contenu externe retiré du diagramme : les images et références distantes ne sont jamais
          chargées.
        </p>
      ) : null}
      {state === 'error' || state === 'external' || showSource ? fallback : null}
      <div
        aria-label="Diagramme"
        className={state === 'ready' && !showSource ? 'overflow-x-auto py-1' : 'hidden'}
        ref={host}
        role="figure"
      />
      {state === 'pending' ? (
        <span
          className="inline-flex items-center gap-2 text-xs text-muted-foreground"
          role="status"
        >
          <LoaderCircle aria-hidden="true" className="animate-spin" size={13} />
          Diagramme en cours de rendu…
        </span>
      ) : null}
      {state === 'ready' ? (
        <Button
          aria-pressed={showSource}
          className="mt-1 h-7 px-2 text-xs"
          onClick={() => setShowSource((value) => !value)}
          size="sm"
          variant="ghost"
        >
          <Code aria-hidden="true" size={13} />
          {showSource ? 'Voir le diagramme' : 'Voir la source'}
        </Button>
      ) : null}
    </div>
  );
}

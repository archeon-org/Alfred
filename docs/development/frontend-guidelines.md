# Guidelines frontend Alfred

Cette convention s'applique à `apps/web`. Elle complète
[l'ADR 0009](../adr/0009-application-and-test-topology.md) et formalise
[l'ADR 0011](../adr/0011-frontend-design-system.md). Le workspace conserve son identité claire
sauge, sa navigation sombre et son relief. Une migration technique ne justifie pas un redesign.

## Choisir un composant

1. Chercher la primitive existante dans `src/components/ui`, puis le composant shadcn/ui adapté.
   Son code reste local, revu et personnalisé par tokens et variantes.
2. Si shadcn ne couvre pas le besoin, composer les primitives existantes. Créer un composant local
   avec Tailwind si nécessaire. Un composant propre au workspace reste dans son domaine.
3. Utiliser du CSS écrit à la main seulement pour les tokens, les règles globales ou une exception
   difficile à exprimer proprement avec Tailwind : keyframes, portée de thème, sélecteur complexe.
   Documenter la raison près de la règle ; ne pas recréer une feuille CSS parallèle pour une page.

L'absence d'un widget dans shadcn ne justifie **pas l'installation d'une autre bibliothèque UI**.
Les dépendances d'implémentation des composants shadcn, notamment Radix et
`react-resizable-panels`, ne sont pas des design systems concurrents. Réutiliser celles présentes ;
ne pas reconstruire leur gestion du focus et du clavier. Une nouvelle dépendance nécessaire à
une primitive shadcn doit être identifiée et justifiée dans le changement, sans importer un kit
entier. Les futures intégrations spécialisées, comme un éditeur documentaire, constituent un autre
périmètre et ne doivent pas entrer dans une simple retouche de présentation.

## Primitives et variantes

- `components/ui` contient des primitives sans données ni imports métier. Les composants de domaine
  les composent ; ils ne dupliquent pas leur structure accessible ni leurs états d'interaction.
- Les props natives dérivent de `ComponentProps<'button'>` ou de la primitive sous-jacente. Utiliser
  des imports de types explicites, l'alias `@/lib/cn` et des exports nommés. Exposer `data-slot` sur
  les racines des primitives pour les cibler sans dépendre de leur structure interne.
- Les différences récurrentes de taille et d'intention deviennent des variantes typées, avec
  `class-variance-authority` lorsque plusieurs variantes le justifient. Une prop `className`
  ajuste la composition ; elle ne doit pas recolorer systématiquement une primitive.
- Un bouton d'action utilise `Button` ou sa composition `IconButton`. Le type par défaut reste
  `button` ; seul un bouton qui soumet réellement un formulaire prend `type="submit"`.
- Employer `Input`, `Textarea`, `Checkbox`, `Switch` et les primitives de dialogue/onglets pour les
  interactions correspondantes. Garder les éléments HTML natifs pour leur sémantique normale :
  titres, liens, listes, formulaires, sections. Il ne s'agit pas d'envelopper chaque balise.
- Un lien reste un lien, un bouton reste un bouton. Ne pas imbriquer deux éléments interactifs.
- Les interactions transverses ont une primitive unique sous `components/ui`, à réutiliser telle
  quelle plutôt qu'à recopier par domaine : `ConfirmDialog` pour toute confirmation (suppression,
  action irréversible), `TextFieldDialog` pour créer ou renommer une ressource nommée,
  `MarkdownEditor` / `MarkdownDocumentDialog` / `MarkdownView` pour tout document Markdown. Une
  nouvelle variante se fait par prop ou variante typée, jamais par duplication du composant.

## Couleurs, typographie et géométrie

Les composants consomment des **rôles sémantiques**, par exemple `bg-background`, `text-foreground`,
`text-muted-foreground`, `border-border`, `bg-primary`, `text-primary-foreground`, `ring-ring`.
Les surfaces spécifiques utilisent des rôles dédiés (`sidebar`, `sidebar-foreground`, etc.) ou
une portée de tokens sur leur conteneur.

Les valeurs de couleur vivent dans `src/styles.css` et ses palettes importées
(`src/styles/appearance-palettes.css`). Aucun hexadécimal, `rgb()` ou `hsl()` dans le
JSX, aucune classe de palette (`brand-*`, `ws-*`, `green-600`, `stone-200`, etc.) pour définir
l'apparence d'un composant. Une nouvelle couleur doit correspondre à un rôle utile ; ne pas créer
un token par nuance rencontrée pendant une migration. `transparent`, `currentColor` et l'héritage
restent des mécanismes de composition, pas une seconde palette.

Utiliser l'échelle Tailwind pour l'espacement, les rayons et la typographie ; centraliser les
extensions réellement partagées. Les libellés utilisateur ont un plancher de **11 px à la taille
racine standard**, exprimé en unité relative, y compris les mentions secondaires et les aides.
Ce plancher ne dispense pas du contrôle de lisibilité, du zoom et du contraste.

Les valeurs arbitraires ne sont pas interdites indistinctement. Une grille calculée, une largeur
minimale de panneau, un ratio ou une géométrie décorative peuvent en avoir besoin. Les garder
locales et explicites ; commenter une valeur inhabituelle dont la raison n'est pas évidente.
Éviter les micro-écarts de spacing et les tailles de texte en pixels recopiés de la maquette.

## Thème, relief et mouvement

Le thème par défaut reste **clair sauge**. Les paramètres proposent clair, sombre ou système
et cinq accents. Les tokens complets sont activés sur `html` via `data-theme` et `data-accent`,
y compris pour les portails. Le suivi du thème OS est explicite via le choix système.
Voir [ADR 0019](../adr/0019-browser-appearance-preferences.md) pour la persistance locale validée.

Le relief vient de surfaces, bordures, ombres et états d'interaction cohérents. Un bouton possède
un retour `hover`, `focus-visible`, `active` et `disabled` perceptible. Utiliser un changement de
surface/ombre et, si utile, un déplacement discret à l'appui. Les transitions restent brèves et
ciblées ; éviter `transition-all`, les animations permanentes décoratives et les sauts de layout.

Respecter `prefers-reduced-motion` **et** la préférence persistante de l'application : neutraliser
les déplacements, transitions et animations décoratives, tout en conservant un retour visuel
immédiat et un focus visible. Un skeleton réserve l'espace de son contenu ; il accompagne un état
de chargement réel ou explicitement simulé pour la preview, sans faire croire à une requête réussie.

## Responsabilités et organisation

```text
src/
  components/
    ui/                       primitives partagées, sans métier
    layout/                   structures génériques si réellement réutilisées
    workspace/
      conversation/           transcript, accueil, composeur
      navigation/             sidebar, projets, conversations, compte (menu, déconnexion)
      context/                contexte, équipes, skills, fichiers
      header/                 barre des écrans étroits uniquement
  hooks/workspace/            état et adaptation React du workspace
  services/<domaine>/         requêtes et validation, sans React
  lib/workspace/              types de vue et fonctions pures
  mock/                       données de la preview actuelle
```

Conserver `route → screen → hook → service → client HTTP`. Pas de `fetch` dans une vue, pas de
React dans les services, pas de cache serveur copié dans un contexte. Ne pas ajouter un second
arbre `features/`. Ne pas extraire `packages/ui` sans besoin concret de partage entre applications.

Les vues reçoivent des props minimales, décrites par leurs besoins et les types de domaine ; éviter
`ReturnType<typeof use...>` et le passage d'un hook entier à travers plusieurs composants.
L'état local demeure dans un hook tant qu'il suffit. Ne pas ajouter Zustand ou un contexte global
pour préparer un besoin hypothétique. Ne pas ajouter `memo`/`useMemo` sans coût ou stabilité
référentielle à résoudre ; mesurer avant d'affirmer une amélioration de performance.

## Preview et données réelles

Les données de `src/mock` font actuellement partie de la preview produit livrée. Elles restent
séparées des composants et des types de vue ; ce ne sont pas des fixtures à déplacer automatiquement
sous `test`. Les créations de démonstration restent en mémoire. Les seules préférences visuelles sont
persistées via `useLocalStorage` et l’adaptateur partagé ; les vues n’accèdent pas au stockage. Le composeur ne doit
pas simuler l'exécution d'un agent ni une sauvegarde serveur.

Lors du branchement d'un contrat métier, remplacer l'alimentation mock par un service et un hook
explicites, puis retirer les données de démonstration devenues inutiles du chemin concerné. Ne jamais
utiliser un mock comme repli silencieux après une erreur réelle. Ne pas désactiver `RequireSession`
pour rendre la preview plus facile à tester.

## Vérification et revue

- Vérifier clavier, labels, focus après dialogue, états désactivés, contraste et tailles tactiles.
  Un contrôle compact garde une zone utilisable et un nom accessible ; une icône seule ne suffit pas.
- Vérifier le viewport étroit, le zoom et les deux préférences de mouvement. Tester le thème OS sombre
  pour détecter une activation accidentelle de styles sombres dans le thème clair.
- Tester les interactions observables et les frontières, sans tests qui recopient simplement une
  liste de classes. Les contrôles statiques du design system complètent les tests de comportement.
- Exécuter `pnpm verify`, puis `pnpm test:e2e` pour les parcours, le responsive et les changements de
  primitives interactives. Une modification purement documentaire utilise les contrôles de format
  et de liens appropriés. Rapporter les tests ignorés et les limites de la vérification visuelle.
- Relire le diff : réemploi d'une primitive, tokens sémantiques, variantes utiles, exceptions CSS
  motivées, frontières préservées, aucune dépendance UI ajoutée par commodité.

Un audit est un point de départ : vérifier ses constats dans le code et distinguer bug, règle
retenue et capacité future. Les nombres historiques, la disponibilité d'un paquet ou une cible
architecturale ne prouvent ni l'état courant ni une fonctionnalité livrée.

## Raccourcis clavier

`lib/workspace/keyboard-shortcuts.ts` définit les quatre actions et leurs touches par défaut
(`WORKSPACE_SHORTCUTS`) ; chaque personne peut les changer dans Paramètres › Raccourcis clavier
(`/app/settings?section=shortcuts`, composant `ShortcutSettings`), aussi ouvert par ⌘/ ou Ctrl+/ et
par l'entrée « Raccourcis clavier » du menu du compte. Les choix personnels sont un enregistrement
borné dans le navigateur (`alfred.shortcuts.v1`, `services/workspace/shortcut-store.ts`, décodage
`decodeShortcutPreferences`), partagé entre onglets comme l'apparence (ADR 0019) ; `resolveBindings`
fusionne défauts et choix, et `useShortcutPreferences` est la seule source des touches effectives.
`useWorkspaceShortcuts` les écoute sur la fenêtre et `useShortcutHint(action, label)` fournit
`aria-keyshortcuts` et le `title` d'un contrôle qui répond aussi au raccourci.

Règles, imposées aux défauts comme aux touches enregistrées (`checkBinding`) : le modificateur de la
plateforme (⌘ sur Apple, Ctrl ailleurs, jamais Alt/Option) plus une touche physique identifiée par
`KeyboardEvent.code`, jamais une touche de fonction, jamais une touche qu'un navigateur majeur ou
l'édition de texte réserve avec ce modificateur (table `RESERVED` : lettres, chiffres, `-`, `=`, `[`,
`]`, `,` et `.` sans Maj, Espace sans Maj, Tab, Entrée, Échap, effacement, flèches, Début, Fin), et
jamais une touche qu'une autre action tient déjà. Un défaut doit en plus exister tel quel sur AZERTY
et QWERTY. L'enregistreur capture la prochaine touche sur la fenêtre (phase de capture,
`preventDefault`), ignore les modificateurs seuls, refuse avec la raison affichée (`role="alert"`) et
s'annule par Échap. Le glyphe affiché est celui que la disposition a produit (`keyLabel`), avec un
repli US pour les touches mortes ; sans code physique (clavier virtuel, événement synthétique) la
correspondance se fait sur ce glyphe. Le `/` par défaut accepte Maj ou non, car il en a besoin sur
AZERTY seulement ; une touche personnelle exige exactement l'état de Maj enregistré.

## Transcript, Markdown et diagrammes

Le transcript ne met en bulle que le message de la personne (`bg-primary/10`, aligné à droite) ;
la réponse d'Alfred se lit comme du texte de page, sans bordure ni fond, sur la largeur de la
colonne de lecture. Sous chaque réponse posée, une barre d'actions discrète (`TurnActions`) porte
« Copier la réponse » (source Markdown), « Événements du runtime (N) » quand les diagnostics sont
actifs (voir plus bas) et « Voir la trace de cette réponse » quand l'API sert des liens de trace.
Aucun avatar : l'alignement suffit, et les libellés « Vous » / « Alfred » restent en `sr-only`.

`MarkdownView` (`components/ui/markdown-view.tsx`) est l'unique rendu Markdown : chat, aperçu de
l'éditeur de skills, documents de contexte. Il s'appuie sur `react-markdown` + `remark-gfm`
(tables, listes imbriquées, cases à cocher en lecture seule, barré, liens automatiques), avec une
table de composants maison pour les styles. Règles de sécurité, toutes structurelles : le HTML brut
est ignoré (`skipHtml`, jamais parsé), une URL n'est conservée que si elle commence par `http(s)://`
ou `mailto:` (sinon le libellé reste du texte), les images ne sont **jamais chargées** et
apparaissent comme un lien « Image : … », et rien ne passe par `dangerouslySetInnerHTML`. Un bloc
de code (`MarkdownCodeBlock`) affiche son langage et un bouton Copier. `markdownToText`
(`lib/markdown/markdown-text.ts`) aplatit un document sur le même parseur pour les résumés.

Un bloc ` ```mermaid ` **fermé** est dessiné par `MermaidDiagram` (`components/ui/mermaid-diagram.tsx`) :
`mermaid` est importé dynamiquement au premier diagramme (chunk séparé), initialisé en
`securityLevel: 'strict'` (sortie assainie par DOMPurify, pas d'HTML dans les étiquettes, pas de
`click`), `suppressErrorRendering: true`, `htmlLabels: false` (les étiquettes restent du texte SVG : ni
`<img>`, ni `<iframe>`, ni fond CSS), thème `base` alimenté par nos jetons (`--background`,
`--foreground`, `--primary`, `--muted`, `--border`…) et redessiné quand `data-theme`/`data-accent`
changent. Mermaid mesure le diagramme dans le DOM vivant avant de rendre la main : une source qui
demande une ressource (forme `img:`/`image:`, `url(...)`, `@import`, `themeCSS`, média HTML,
`src=`, `xlink:`) n'est **jamais** dessinée (`referencesExternalContent`) et s'affiche en source
avec une note. Le SVG produit est ensuite adopté comme nœuds DOM via `DOMParser`, jamais comme
chaîne HTML, après `scrubExternalReferences` (`lib/markdown/svg-scrub.ts`) qui retire `image`,
`foreignObject`, `use` externe, `href` non locaux, attributs de ressource, `on*` et styles avec
`url(...)`/`@import` : défense en profondeur, car le niveau strict de Mermaid seul laisse passer une
image distante. Un diagramme ne provoque donc aucune requête réseau. Une source de plus de 20 000
caractères, une erreur de syntaxe ou un échec de chargement montrent la source en bloc de code avec
la raison ; « Voir la source » bascule à la demande. Pendant le streaming, un bloc n'est dessiné (ni
colorié) que si **sa propre** ligne de clôture existe (`isFenceUnterminated` : même caractère,
longueur au moins égale à l'ouverture, à partir des positions du parseur), ce qui accepte un bloc
`~~~` contenant des `` et un bloc ` ```` ` contenant des ` `` `. La clôture d'un bloc est décidée
à partir du parseur (`isFenceUnterminated`) : le texte du nœud contient toutes les lignes après
l'ouverture tant que la clôture manque, une de moins (la ligne de clôture) une fois fermé, quels
que soient le préfixe de conteneur (`> `, indentation de liste), le caractère ou la longueur de la
clôture. En production, nginx sert `style-src 'self' 'unsafe-inline'`parce que Mermaid injecte
une balise`<style>`dans chaque SVG, et`script-src 'self' 'wasm-unsafe-eval'` pour compiler le
moteur Oniguruma (ADR 0025) ; aucune autre source de script.

Un diagramme Mermaid n'est dessiné qu'après deux contrôles : un regard sur le texte
(`referencesExternalContent` : `img:`, `url(`, `@import`, `themeCSS`, balises HTML) puis, dans
`lib/markdown/mermaid-render.ts`, l'inspection du diagramme **parsé** (`getDiagramFromText`) : un
nœud portant une image (`img`, quelle que soit la graphie YAML de la clé) n'est jamais rendu, car la
forme image charge son adresse en mesurant le nœud. Les directives `%%{init}%%` et le front
matter ne peuvent toucher ni `htmlLabels`, ni `themeCSS`, ni `themeVariables`, ni `theme`, ni
`fontFamily` (`secure`, appliqué à tout niveau). L'inspection et le rendu s'enchaînent dans une
file unique : Mermaid parse dans une base partagée par type de diagramme. Le SVG rendu passe
enfin par `scrubExternalReferences`.

Coloration syntaxique : un bloc **fermé** dont le langage a une grammaire embarquée est tokenisé
par `shiki` (`lib/markdown/highlight.ts`, hook `useHighlightedCode`) : moteur Oniguruma en
WebAssembly, chargé au premier bloc (le moteur JavaScript laissait WebKit rendre des lignes
entières en un seul jeton sur les grammaires TypeScript), grammaire importée à la demande depuis
`@shikijs/langs/<id>` (TypeScript, JavaScript, JSON, Python, Bash, YAML, SQL, HTML, CSS, Markdown,
Mermaid, Java, Go, Rust, Diff, Dockerfile, TOML, avec alias `ts`, `js`, `py`, `sh`…), thème en
variables CSS (`--shiki-token-*`, définies dans `styles.css` pour le clair et le sombre). Les
jetons deviennent des `span` React avec une couleur CSSOM : ni HTML injecté, ni style en ligne
bloqué par la CSP. Un langage inconnu, une source de plus de 30 000 caractères ou une clôture
manquante laissent le texte brut ; `data-highlighted="true"` marque un bloc colorié.

Performance : `MarkdownView` est mémoïsé (un transcript se re-rend à chaque événement streamé
alors que les réponses enregistrées ne changent pas ; re-parser une longue réponse coûte ~100 ms)
et le texte d'une réponse en cours passe par `useDeferredValue` : React garde l'ancien rendu à
l'écran et re-rend avec la valeur la plus récente en priorité basse, ce qui laisse passer les
interactions ; cela ne borne pas le nombre de parses ni n'interrompt un parse synchrone commencé.

## Runtime event diagnostics

`VITE_DEBUG_EVENTS=true` enables the per-answer runtime event dialog, localStorage capture and
JSON download. The default is `false`; absent or other values disable capture, storage access and
the controls while normal message processing continues. Set it in `apps/web/.env` for host Vite and
restart Vite. For Compose, set the root `.env` value and recreate the development web container or
rebuild the production web image. This is public build configuration, not an authorization control.

Every captured event is filed under the execution that produced it: the observer records
`{ id, executionId, event: <AG-UI type>, data: <event> }` and each answer of the transcript (live
turn through `turn.execution.id`, stored row through `Message.executionId`) shows
« Événements du runtime (N) » for its own events. The control opens `RuntimeEventsDialog`: the
events of that execution in order, each expandable to its JSON, and a download of that execution's
events as `alfred-events-<executionId>.json`. Debug copies are keyed by user and conversation under
`alfred:runtime-event-debug:v4:<encoded-user-id>:<encoded-conversation-id>` and store `version: 4`;
sending another message never discards the events of earlier answers, and a reload restores them
against the stored rows. The observation stream carries AG-UI protocol events (ADR 0023, revision of
2026-09-15 evening). Capture and reload accept only the AG-UI events of the Alfred contract
(`RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`, `STATE_SNAPSHOT`, `TEXT_MESSAGE_START/CONTENT/END`,
`TOOL_CALL_START/END/RESULT`), canonicalized by `canonicalAgUiEvent` in
`lib/workspace/ag-ui-events.ts` with the conversation **and** the execution as scope: only known
fields survive, a run event whose `runId` is not the execution it is filed under is dropped, a
`STATE_SNAPSHOT` must carry an `AlfredRunState` whose execution and conversation match, a
`RUN_FINISHED` may only carry a `success` outcome, a `TEXT_MESSAGE_START` must be an `assistant`
message, a `TOOL_CALL_RESULT` may only carry `completed` or `failed`, and one text delta is bounded
by the answer limit. Raw native event names, other AG-UI events (`TOOL_CALL_ARGS`, `RAW`, `CUSTOM`, …),
invalid payloads and mismatched scope produce an explicit diagnostic error. Downloads contain the validated
public payloads, which can still include visible conversation content; they are not raw
provider/tool exports or an authorization boundary.

Legacy `alfred:runtime-event-debug:v1:`, `v2:` and `v3:` records are never read or migrated
(`v3` predates the per-execution filing). Because they may hold conversation content, the first use
of diagnostics in a page removes them by key, without parsing them, and touches nothing else in
storage: the sweep covers every `v1`–`v3` record of the origin, whatever conversation or execution
it belonged to, since all three formats are abandoned. Disabling the flag returns before validation
or any storage access, leaving every namespace untouched. Within the stated budgets, downloads include every captured public event of
an execution; there is no 200-event/240-character truncation. This remains the explicit opt-in
exception to the ordinary browser-content storage rule, and credentials must never enter the public
schema.

Persistence is attempted every 250 ms while events arrive and on page hide. A 4 MiB serialized
UTF-16 per-conversation storage cap or browser quota failure produces an explicit warning; complete
in-memory events remain downloadable until reload. A failed save replaces stale saved events with
an incomplete-history marker when storage access permits; it never intentionally presents an older
snapshot as the complete capture. A 16 MiB aggregate serialized capture budget
stops further capture with an explicit warning. This bounds debug copies, not exact JavaScript heap
usage. This browser diagnostic history does not replace server-owned transcripts or replay/audit
contracts (ALF-DEC-001 accepted; ALF-DEC-006 accepted-with-risk; ALF-DEC-008/051 remain in discussion).
Production content-diagnostic retention policy remains an operator/privacy-owner responsibility.

## Trace links (development diagnostic)

`FEATURE_TRACE_LINKS_ENABLED=true` on the API (with `TRACE_LINK_UI_URL`,
`TRACE_LINK_ORGANIZATION_ID` and `TRACE_LINK_PROJECT_ID`, all public address parts of the runtime's
LangSmith console) publishes `traceLinks: true` in `GET /api/features` and serves
`GET /api/executions/:id/trace-link` → `{ url }` for an execution the caller may observe. The
browser then shows « Voir la trace de cette réponse » under each answer (`TraceLinkAction`): the
address is fetched on click, opened in a new tab (`noopener,noreferrer`) and kept as a plain link so
a blocked pop-up never loses it; `404 trace_unavailable` reads as an inline notice. No `VITE_*`
flag is involved: the server manifest is the single source of truth, and the browser never calls the
console itself (`connect-src 'self'`). `TRACE_LINK_UI_URL` must be a plain `http(s)` origin with an optional
path: credentials, query and fragment are refused at startup, `buildTraceUrl` refuses credentials
again, and the shared contract rejects any link carrying them. Additive manifest fields such as
`traceLinks` carry a `false` default in `featureFlagsSchema`, so a newer browser in front of an
older API loses only the new capability instead of failing closed on every flag. The API refuses the flag in production: this is a development
diagnostic governed by [ADR 0024](../adr/0024-development-trace-links.md), which records the bounded
exception to the "no native runtime identifier on the wire" rule of ADR 0023.

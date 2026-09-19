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

## Runtime event diagnostics

`VITE_DEBUG_EVENTS=true` enables the conversation's runtime event viewer, localStorage capture and
JSON download. The default is `false`; absent or other values disable capture, storage access and
the viewer while normal message processing continues. Set it in `apps/web/.env` for host Vite and
restart Vite. For Compose, set the root `.env` value and recreate the development web container or
rebuild the production web image. This is public build configuration, not an authorization control.

Debug copies are keyed by user and conversation under
`alfred:runtime-event-debug:v3:<encoded-user-id>:<encoded-conversation-id>` and store `version: 3`.
The observation stream carries AG-UI protocol events (ADR 0023, revision of 2026-09-15 evening);
the observer records each validated event as `{ id, event: <AG-UI type>, data: <event> }`.
Capture and reload accept only the AG-UI events of the Alfred contract (`RUN_STARTED`,
`RUN_FINISHED`, `RUN_ERROR`, `STATE_SNAPSHOT`, `TEXT_MESSAGE_START/CONTENT/END`,
`TOOL_CALL_START/END/RESULT`), canonicalized by `canonicalAgUiEvent` in
`lib/workspace/ag-ui-events.ts`: only known fields survive, a `STATE_SNAPSHOT` must carry an
`AlfredRunState` whose execution and conversation belong to the selected conversation, a
`RUN_FINISHED` may only carry a `success` outcome, a `TEXT_MESSAGE_START` must be an `assistant`
message, a `TOOL_CALL_RESULT` may only carry `completed` or `failed`, and one text delta is bounded
by the answer limit. Raw native event names, other AG-UI events (`TOOL_CALL_ARGS`, `RAW`, `CUSTOM`, …),
invalid payloads and mismatched scope produce an explicit diagnostic error. Downloads contain the validated
public payloads, which can still include visible conversation content; they are not raw
provider/tool exports or an authorization boundary.

Legacy `alfred:runtime-event-debug:v1:` and `v2:` records are not read, migrated or automatically
deleted, even with diagnostics enabled. Disabling the flag returns before validation or any storage access,
leaving both namespaces untouched. Remove existing keys through browser storage tools when erasure
is required. Within the stated budgets, downloads include every captured public event across runs;
there is no 200-event/240-character truncation. This remains the explicit opt-in exception to the
ordinary browser-content storage rule, and credentials must never enter the public schema.

Persistence is attempted every 250 ms while events arrive and on page hide. A 4 MiB serialized
UTF-16 per-conversation storage cap or browser quota failure produces an explicit warning; complete
in-memory events remain downloadable until reload. A failed save replaces stale saved events with
an incomplete-history marker when storage access permits; it never intentionally presents an older
snapshot as the complete capture. A 16 MiB aggregate serialized capture budget
stops further capture with an explicit warning. This bounds debug copies, not exact JavaScript heap
usage. This browser diagnostic history does not replace server-owned transcripts or replay/audit
contracts (ALF-DEC-001 accepted; ALF-DEC-006 accepted-with-risk; ALF-DEC-008/051 remain in discussion).
Production content-diagnostic retention policy remains an operator/privacy-owner responsibility.

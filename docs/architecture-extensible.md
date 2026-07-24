# Architecture extensible de Pi Workbench

Pi Workbench suit un modèle **source-first** : les personnalisations sont développées dans un fork, compilées avec l’application et rechargées par Vite en développement. L’objectif n’est pas d’installer du code tiers à chaud, mais de permettre à un fork de rester proche d’upstream.

Une architecture d’extension reste utile dans ce modèle : le fork définit où vit le code personnalisé, tandis que les contrats d’extension évitent qu’il modifie les fichiers centraux à chaque ajout. Git peut alors intégrer les changements upstream avec beaucoup moins de conflits.

## Compromis retenu

```text
Dépôt upstream
├── cœur et contrats publics stables
├── fonctionnalités officielles
└── points de composition réservés

Fork utilisateur
└── personnalisations frontend, backend et Pi isolées
```

Ce modèle conserve deux propriétés :

- le chemin courant utilise des contrats documentés et compatibles ;
- le fork reste libre de modifier n’importe quel fichier lorsqu’un contrat ne suffit pas.

Une modification directe du cœur est une échappatoire assumée, mais elle sort de la garantie de compatibilité.

## Pourquoi ne pas charger des plugins à l’exécution

Le fork et le cycle `npm run dev` fournissent déjà la compilation TypeScript, React, le HMR et la résolution des imports. Un chargeur dynamique ajouterait la découverte de packages, le versionnement, la sécurité, l’isolation de React et la gestion de trois environnements d’exécution sans améliorer le flux visé.

Pi Workbench n’introduit donc pas, tant qu’un besoin concret ne le justifie :

- de marketplace ou de gestionnaire de plugins ;
- de chargement de JavaScript distant ;
- de Module Federation ;
- de sandbox ou de système de permissions ;
- de protocole d’activation dynamique.

## Trois niveaux de personnalisation

### Contributions ciblées

Les modifications courantes passent par des contributions typées :

- renderers d’appels d’outils ;
- renderers de messages ;
- renderer d’activité ;
- widgets et actions des panneaux ;
- commandes et actions du composer.

Le cœur reste propriétaire de la navigation, du cycle React, de l’accessibilité du shell et de la synchronisation avec Pi. Chaque renderer peut remplacer entièrement le rendu concerné ou réutiliser un composant officiel `Default` pour n’en modifier qu’une partie.

### Shell remplaçable

La disposition générale a un propriétaire unique. Un fork peut remplacer le shell officiel pour déplacer ou recomposer les zones sans laisser plusieurs extensions concurrentes muter le même DOM.

Le shell reçoit des slots stables tels que :

```text
workspaceSidebar
conversation
composer
toolSidebar
dialogs
notifications
```

Il peut rendre ces slots dans un autre ordre ou les remplacer à partir du runtime public. Déplacer une sidebar relève du shell, pas d’une contribution de widget.

### Modification directe

Le fork peut toujours remplacer le runtime, le protocole local ou tout composant interne. Les imports internes et les modifications directes ne bénéficient d’aucune promesse de compatibilité avec upstream.

## Runtime headless et shell officiel

L’état transversal actuellement orchestré par `src/App.tsx` doit être progressivement séparé de sa présentation :

```text
Événements et snapshots Pi
            │
            ▼
   WorkbenchRuntime headless
            │
      modèles et actions
            │
            ▼
   DefaultWorkbenchShell
```

Le runtime expose des vues en lecture seule et des capacités explicites plutôt que les setters React internes :

```ts
interface WorkbenchRuntime {
  workspace: WorkspaceView
  sessions: readonly SessionView[]
  selectedSession: SessionView | null
  conversation: ConversationView
  activity: ActivityView | null
  actions: WorkbenchActions
}
```

Cette séparation permet au shell officiel et aux shells personnalisés de partager le même cycle de session sans dupliquer la communication avec Pi.

## Modèles normalisés sans perte d’information

Les extensions consomment en priorité des modèles d’interface stables :

```ts
interface ToolCallView {
  id: string
  name: string
  args: unknown
  result?: { content: unknown; isError: boolean }
  status: 'generating' | 'running' | 'completed' | 'interrupted'
}

interface ActivityView {
  kind: 'working' | 'thinking' | 'tool-preparing' | 'tool-waiting' | 'writing' | 'waiting'
  agentName?: string
  thinking?: string
}
```

La normalisation ne doit jamais supprimer l’accès à la donnée source. Le runtime publie aussi l’enveloppe RPC brute de Pi sous la forme `unknown` ou `JsonObject`. Une extension choisit ainsi entre :

- le modèle normalisé, couvert par la compatibilité de Pi Workbench ;
- le protocole RPC brut, dont la compatibilité dépend de Pi.

Les données reçues du protocole brut restent non fiables et doivent être validées avant usage.

## Contrat frontend

Le contrat public initial doit rester petit et additif :

```ts
interface WorkbenchExtension {
  apiVersion: 1
  id: string
  toolCalls?: Record<string, ToolCallRenderer>
  messages?: Record<string, MessageRenderer>
  activity?: ActivityRenderer
  rightSidebarWidgets?: RightSidebarWidget[]
  commands?: WorkbenchCommand[]
}
```

Les règles de composition sont déterministes :

- chaque contribution possède un identifiant stable ;
- un doublon dans les personnalisations échoue explicitement en développement ;
- une contribution inconnue ne remplace jamais silencieusement une autre ;
- un renderer défaillant est isolé et laisse le renderer officiel servir de repli.

Les composants officiels réutilisables font partie du contrat. Les renderers d’outil, de message et d’activité peuvent fournir un affichage complet ou appeler `renderDefault()` pour conserver le rendu officiel. Une seule extension peut remplacer l’indicateur d’activité ; un second remplacement provoque une erreur explicite au démarrage.

Les messages Pi dont le rôle vaut `custom` et dont `display` vaut `true` sont transmis à l’interface. Une contribution `messages[customType]` peut remplacer leur rendu et dispose également de `renderDefault()`. Les messages personnalisés cachés restent exclus du snapshot : leur contenu destiné au contexte de Pi ne doit pas être exposé implicitement au navigateur.

## Contrat backend

Un widget qui agit sur le système utilise une contribution backend Node.js. Le navigateur ne reçoit jamais directement les capacités système.

```text
Widget React
    │ /api/extensions/<extension-id>/*
    ▼
Route backend namespacée
    │
    ▼
API Node.js et système local
```

Une route d’extension ne peut pas remplacer une route du cœur. Elle valide son corps, ses paramètres et son workspace comme toute autre frontière de confiance. Le backend continue d’écouter uniquement sur `127.0.0.1`.

Le code d’un fork est privilégié et peut importer la bibliothèque standard Node.js. Pi Workbench n’essaie pas de le sandboxer.

## Hooks et événements Pi

Le manager diffuse déjà les événements RPC reçus de Pi. Le runtime doit fournir :

- un flux normalisé pour les besoins d’interface courants ;
- un abonnement au flux RPC brut, sans filtrer les événements inconnus.

Les hooks d’extension Pi ne sont pas tous des événements RPC. Un comportement exécuté dans `before_agent_start`, `tool_call`, `context` ou un autre hook reste une responsabilité de Pi.

Une personnalisation nécessitant ces hooks fournit une **extension Pi compagnon**, chargée par le mécanisme public `--extension` de Pi :

```text
Personnalisation Workbench
├── frontend.tsx  — rendu navigateur
├── backend.ts    — capacités système
└── pi.ts         — hooks et comportement agentique
```

Les décisions qui bloquent ou modifient Pi ne transitent jamais par React. Une fermeture d’onglet ou une latence HTTP ne doit pas interrompre la boucle agentique. Le compagnon communique avec le Workbench uniquement par les capacités publiques de Pi et par des enveloppes namespacées et versionnées.

`server/manager.ts` reste le seul propriétaire des processus `pi --mode rpc`. L’ajout d’extensions Pi configurables devra conserver cette responsabilité dans le manager.

## Zone réservée aux forks

Les manifestes de personnalisation sont livrés vides et ne doivent presque jamais être modifiés par upstream :

```text
src/custom/extensions.ts
server/custom/extensions.ts
```

Le code propre au fork est colocalisé sous les répertoires `custom/`. Les fonctionnalités officielles utilisent les mêmes contrats, mais vivent dans leurs répertoires `src/features/` et `server/` actuels.

Les styles personnalisés utilisent des CSS Modules ou des classes préfixées. Les sélecteurs visant les classes internes du Workbench et les imports internes restent possibles, mais ne sont pas couverts par la compatibilité.

## Garantie de compatibilité

Pour `apiVersion: 1`, Pi Workbench garantit :

- des évolutions additives des types publics ;
- la stabilité des identifiants et des règles de résolution ;
- la disponibilité des slots et composants `Default` documentés ;
- l’accès aux événements RPC bruts sans suppression des événements inconnus ;
- l’isolation des erreurs de rendu ;
- le namespace des routes backend ;
- une version majeure et un guide de migration avant toute rupture nécessaire.

Cette garantie ne couvre pas :

- les imports depuis des modules internes ;
- les modifications directes du cœur ;
- les sélecteurs CSS globaux visant l’implémentation ;
- les changements du protocole brut décidés par Pi ;
- les extensions qui contournent les validations aux frontières.

Le cœur peut donc évoluer tant que son contrat public reste compatible. La stabilité porte sur l’API observable, pas sur l’immobilité de son implémentation.

## Mise en œuvre progressive

L’architecture doit être validée par des tranches verticales plutôt que par une réécriture générale :

1. renderer de ToolCall remplaçable avec composant `Default`, actions et repli sur erreur ;
2. widget frontend relié à une route backend namespacée ;
3. renderer de message et renderer d’activité ;
4. shell minimal remplaçable ;
5. chargement configurable d’une extension Pi compagnon, après accord explicite sur la modification du manager ;
6. migration progressive des fonctionnalités officielles vers les contrats éprouvés.

Chaque nouveau point d’extension doit répondre à un besoin concret. Le système reste un overlay de personnalisation pour forks, pas une plateforme de plugins spéculative.

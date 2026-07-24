# Personnaliser Pi Workbench dans un fork

Pi Workbench suit un modèle **source-first** : les personnalisations sont écrites dans un fork, compilées avec l’application et rechargées par Vite en développement. Le code source reste toujours modifiable ; les points d’extension servent seulement à éviter des conflits upstream récurrents.

Ils ne constituent pas une plateforme de plugins ni une API maintenue séparément du projet. Une évolution upstream peut demander d’adapter le code du fork ; TypeScript et les tests rendent alors la rupture visible au build.

## Compromis retenu

```text
Dépôt upstream
├── cœur et fonctionnalités officielles
└── coutures de personnalisation réservées

Fork utilisateur
├── contributions frontend et backend isolées
└── modifications directes lorsque les coutures ne suffisent pas
```

Le chemin le plus simple prévaut : modifier directement un composant local est normal. Une contribution dédiée devient utile seulement lorsqu’elle évite de modifier un point central ou facilite la reprise des changements upstream.

## Pourquoi ne pas charger des plugins à l’exécution

Le fork et `npm run dev` fournissent déjà TypeScript, React, le HMR et la résolution des imports. Pi Workbench n’ajoute donc pas :

- de marketplace ou de gestionnaire de plugins ;
- de chargement de JavaScript distant ;
- de Module Federation ;
- de sandbox ou de système de permissions ;
- de protocole d’activation ou de versionnement dynamique.

Le code personnalisé est privilégié au même titre que le reste du fork. Il doit être relu avant compilation et n’est pas isolé du système local.

## Contributions frontend

Les contributions frontend vivent dans `src/custom/extensions.ts`. Elles peuvent actuellement fournir :

- des renderers d’appels d’outils ;
- des renderers de messages Pi personnalisés visibles ;
- un renderer d’activité ;
- des widgets de sidebar droite.

```ts
interface WorkbenchExtension {
  id: string
  toolCalls?: Record<string, ToolCallRenderer>
  messages?: Record<string, CustomMessageRenderer>
  activity?: ActivityRenderer
  rightSidebarWidgets?: readonly RightSidebarWidget[]
}
```

Le registre refuse les identifiants ambigus et les contributions concurrentes. Une erreur de renderer est isolée et utilise le rendu officiel comme repli lorsqu’il existe.

Les messages Pi dont le rôle vaut `custom` et dont `display` vaut `true` peuvent être rendus par `messages[customType]`. Les messages cachés restent exclus du snapshot envoyé au navigateur afin de ne pas exposer implicitement du contexte interne à Pi.

Ces types sont des coutures pratiques compilées avec le fork, pas une garantie de compatibilité entre versions. Un besoin qui ne correspond pas à ces contributions peut modifier directement le composant concerné.

## Contributions backend

Un widget nécessitant le système local peut déclarer une capacité Node.js dans `server/custom/extensions.ts` :

```text
Widget React
    │ /api/extensions/<extension-id>/*
    ▼
Route backend namespacée
    │
    ▼
API Node.js et système local
```

Chaque contribution possède exclusivement son namespace `/api/extensions/<extension-id>/*` et ne peut pas remplacer une route du cœur. Son `handleRequest` reçoit la méthode, le chemin relatif, l’URL, les objets HTTP Node.js et les helpers `readJsonBody()` et `resolveWorkingDirectory()`.

La valeur retournée est sérialisée en JSON avec un statut 200. Le handler peut aussi écrire directement dans `response` pour produire un autre statut, un fichier ou un flux, et lever `BackendExtensionHttpError` pour une erreur HTTP contrôlée.

Toutes les données HTTP restent non fiables. Le handler doit valider son corps, ses paramètres et son workspace. Le backend continue d’écouter uniquement sur `127.0.0.1`.

## Hooks Pi

Les comportements exécutés dans `before_agent_start`, `tool_call`, `context` ou les autres hooks appartiennent à une extension Pi, pas à React. Un fork qui en a besoin utilise le mécanisme public d’extension de Pi et adapte explicitement son lancement dans le manager.

`server/manager.ts` reste l’unique propriétaire des processus `pi --mode rpc`. Aucun point d’extension Workbench ne doit déplacer cette responsabilité ni faire dépendre la boucle agentique d’un onglet navigateur.

## Zones réservées aux forks

Les manifestes livrés vides sont :

```text
src/custom/extensions.ts
server/custom/extensions.ts
```

Le code propre au fork peut être colocalisé sous ces répertoires. Les styles personnalisés privilégient les variables existantes, les CSS Modules ou des classes préfixées afin de limiter les collisions.

Les imports internes, les sélecteurs CSS visant l’implémentation et les modifications directes sont autorisés. Ils peuvent simplement demander une résolution manuelle lors d’une mise à jour upstream.

## Limite volontaire

Un nouveau point d’extension n’est ajouté que pour un besoin concret qui traverse un fichier central ou provoque des conflits répétés. Pi Workbench ne cherche pas à rendre chaque composant remplaçable, à extraire un runtime headless ni à fournir un shell alternatif générique.

L’objectif est de garder quelques coutures utiles aux forks, pas de construire une usine à plugins.

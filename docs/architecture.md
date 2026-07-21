# Architecture du projet

Pi Workbench sépare l’interface, l’API HTTP locale et les processus Pi afin qu’un redémarrage du frontend ou du backend ne ferme pas les sessions actives.

```text
Navigateur React
    │ HTTP + SSE
    ▼
server/backend.ts
    │ JSON Lines sur TCP local
    ▼
server/manager.ts
    │ RPC public de Pi
    ▼
processus pi --mode rpc
```

## Frontend

`src/App.tsx` reste l’orchestrateur transversal : il sélectionne le workspace et la session, reçoit le flux SSE, synchronise les snapshots et relie les panneaux. La logique et le rendu propres à une zone vivent dans `src/features/` :

- `composer/` — saisie, commandes et préparation des images ;
- `conversation/` — historique, activité, usages et appels d’outils ;
- `dialogs/` — questionnaires et dialogues d’extensions ;
- `git/` — rail droit, état Git et diffs ;
- `workspace/` — sélection du dossier et sessions récentes.

`src/api.ts` est l’unique frontière HTTP du frontend. Un composant ne communique pas directement avec le manager ou un processus Pi.

`src/App.css` ordonne les feuilles de styles. Les règles globales et responsives vivent dans `src/styles/`; les règles propres à une fonctionnalité sont colocalisées avec celle-ci.

## Backend et manager

`server/backend.ts` expose l’API web, sert le build et diffuse les événements en SSE. Les modules voisins portent les capacités locales spécialisées : Git, fichiers du workspace, sessions récentes et intégrations système.

`server/manager.ts` est le seul propriétaire des processus `pi --mode rpc`. `server/manager-client.ts` relie le backend au manager par un protocole JSON Lines local. Cette responsabilité ne doit pas migrer vers le backend : le manager doit survivre à son redémarrage.

Les fichiers de `server/` restent volontairement à plat. Chaque module a déjà une frontière explicite ; ajouter des sous-couches ne ferait qu’allonger les imports sans réduire les responsabilités.

## Contrats partagés

`shared/` contient les types et protocoles échangés entre les couches. Les formats HTTP, SSE, manager et RPC sont des contrats observables : un déplacement interne ne doit pas les modifier implicitement.

## Flux principaux

1. Le frontend appelle une fonction de `src/api.ts`.
2. `server/backend.ts` valide la requête et traite directement les capacités locales, ou la transmet au manager.
3. Le manager crée, rouvre ou commande le processus Pi concerné.
4. Les événements Pi remontent au backend, puis au navigateur par SSE.
5. `App` actualise l’état transversal et délègue le rendu à la fonctionnalité concernée.

## Où apporter un changement

- Nouvelle présentation d’un outil : `src/features/conversation/tool-calls.ts`, puis son test ciblé.
- Nouveau comportement de conversation ou de composer : fonctionnalité correspondante, sans grossir `App` si l’état n’est pas transversal.
- Nouveau widget droit : lire [`right-sidebar-widgets.md`](right-sidebar-widgets.md).
- Nouvelle route locale : `server/backend.ts`, puis `src/api.ts` si le frontend l’utilise.
- Cycle de vie d’un processus Pi : `server/manager.ts` ou `server/pi-process.ts`, après accord explicite en raison du risque d’interruption.

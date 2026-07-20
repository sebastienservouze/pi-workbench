# Instructions pour les agents

## Architecture et limites

- Le frontend React dans `src/` communique uniquement avec le backend HTTP.
- `server/backend.ts` porte l’API web et le flux SSE. Il peut redémarrer sans interrompre Pi.
- `server/manager.ts` est le seul propriétaire des processus `pi --mode rpc`; ne déplacez pas cette responsabilité dans le backend.
- Utilisez le protocole RPC public de Pi. Ne lisez pas ses fichiers internes pour reproduire une capacité déjà exposée en RPC.
- L’application est locale et écoute uniquement sur `127.0.0.1`. N’élargissez pas cette exposition sans authentification et cadrage explicites.
- N’ajoutez ni base de données, routeur frontend, gestionnaire d’état ou bibliothèque UI sans besoin démontré.

## Auto-modification du projet

Pi Workbench est conçu pour être modifié par les agents qui l’utilisent. Avant d’éditer, analysez le flux existant, réutilisez les conventions du dépôt et cherchez la cause racine plutôt que de contourner un symptôme.

- Préférez le changement le plus petit qui répond au besoin, sans nouvelle dépendance ni abstraction spéculative.
- Préservez les contrats existants, les API, les formats de données et les comportements attendus lorsque c’est possible.
- Examinez les appelants, les tests et les composants voisins avant de modifier une fonction partagée.
- Validez les changements avec les contrôles pertinents et ne mélangez pas vos modifications avec celles déjà présentes dans le dépôt.
- Si une modification introduit une rupture de compatibilité, signalez-la clairement avant de l’appliquer : décrivez le comportement supprimé ou modifié, l’impact attendu et la manière de reprendre ou de migrer.
- `server/manager.ts` est le propriétaire des processus `pi --mode rpc`. Il peut être modifié si le besoin le justifie, mais demandez d’abord l’accord de l’utilisateur : un changement ou un redémarrage du manager peut interrompre la connexion avec Pi et la réponse en cours. La session reste normalement récupérable via l’historique de Pi et doit alors être reprise avec Pi.
- Ne déplacez pas la gestion des processus Pi dans une autre couche et ne modifiez pas le protocole RPC sans nécessité démontrée.

## Commandes

```bash
npm install
npm run dev:manager
npm run dev:backend
npm run dev:frontend
npm run typecheck
npm run lint
npm run build
```

Tests :

```bash
# Un test précis
npm test -- --test-name-pattern="exposes current Pi commands over RPC" test/pi-rpc.integration.test.ts

# Un fichier
npm test -- test/pi-rpc.integration.test.ts

# Toute la suite
npm test
```

Le test d’intégration attend une commande `pi` configurée et l’extension `/agent` disponible.

## Documentation Pi

La documentation de Pi est disponible localement dans `$(npm root -g)/@earendil-works/pi-coding-agent/docs/`.

## Présentations des appels d’outils

Consultez [`docs/tool-call-presentations.md`](docs/tool-call-presentations.md) avant de créer ou modifier l’affichage d’un appel d’outil.

## Widgets de la sidebar droite

Consultez [`docs/right-sidebar-widgets.md`](docs/right-sidebar-widgets.md) avant de créer ou modifier un widget de la sidebar droite.

## Conventions

- Écrivez les identifiants, noms de fichiers et le code en anglais.
- Gardez le code aéré, simple et lisible; donnez aux variables des noms explicites.
- Documentez en français toute fonction applicative de plus de 4 lignes, sauf les fonctions utilitaires évidentes (garde de type, conversion, formatage ou parsing local) et celles déjà commentées. Décrivez son rôle, son contrat, son invariant, son effet de bord ou une raison non évidente; ne paraphrasez jamais le code.
- Respectez TypeScript strict et Oxlint avant de proposer un changement.
- Utilisez des commits au format `<gitmoji> sujet impératif concis`, sans préfixe conventionnel tel que `feat:`.
- Ne revendiquez jamais un test ou un contrôle qui n’a pas été réellement exécuté.

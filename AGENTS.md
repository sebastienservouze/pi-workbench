# Instructions pour les agents

## Architecture et limites

- Le frontend React dans `src/` communique uniquement avec le backend HTTP.
- `server/backend.ts` porte l’API web et le flux SSE. Il peut redémarrer sans interrompre Pi.
- `server/manager.ts` est le seul propriétaire des processus `pi --mode rpc`; ne déplacez pas cette responsabilité dans le backend.
- Utilisez le protocole RPC public de Pi. Ne lisez pas ses fichiers internes pour reproduire une capacité déjà exposée en RPC.
- L’application est locale et écoute uniquement sur `127.0.0.1`. N’élargissez pas cette exposition sans authentification et cadrage explicites.
- N’ajoutez ni base de données, routeur frontend, gestionnaire d’état ou bibliothèque UI sans besoin démontré.

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

## Widgets de la sidebar droite

Consultez [`docs/right-sidebar-widgets.md`](docs/right-sidebar-widgets.md) avant de créer ou modifier un widget de la sidebar droite.

## Conventions

- Écrivez les identifiants, noms de fichiers et le code en anglais.
- Gardez le code aéré, simple et lisible; donnez aux variables des noms explicites.
- Documentez une fonction en français seulement pour expliquer un contrat, un invariant, un effet de bord ou une raison non évidente. Ne paraphrasez jamais le code.
- Respectez TypeScript strict et Oxlint avant de proposer un changement.
- Utilisez des commits au format `<gitmoji> sujet impératif concis`, sans préfixe conventionnel tel que `feat:`.
- Ne revendiquez jamais un test ou un contrôle qui n’a pas été réellement exécuté.

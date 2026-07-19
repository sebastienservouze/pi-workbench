# Pi Workbench

Interface web locale pour piloter plusieurs sessions Pi en parallèle. Le gestionnaire Pi reste indépendant du backend afin que les modifications et redémarrages du frontend ou du backend n’interrompent pas les sessions actives.

Le projet couvre la surface fournie par le mode RPC de Pi : conversations en direct, outils, modèles, niveaux de thinking, commandes et dialogues d’extensions. Les composants exclusivement TUI ne sont pas reproduits.

## Prérequis

- Node.js 24 ou supérieur
- npm
- une commande `pi` configurée et disponible dans le `PATH`
- l’extension fournissant `/agent` pour le sélecteur d’agents

## Installation

```bash
npm install
```

## Développement

Lancer les trois services dans un même terminal :

```bash
npm run dev
```

Ouvrir ensuite <http://127.0.0.1:5173>. `Ctrl+C` arrête le frontend, le backend et le gestionnaire.

Le backend peut être redémarré sans interrompre les processus Pi. Après un redémarrage du gestionnaire, les sessions enregistrées dans `~/.pi-workbench/sessions.json` sont relancées avec leur historique ; une réponse qui était encore en cours reste interrompue.

## Build et exécution

```bash
npm run build
npm run start:manager
npm run start:backend
```

Le backend sert alors l’interface sur <http://127.0.0.1:43121>.

## Contrôles

```bash
npm run typecheck
npm run lint
npm test
```

Exécuter le test d’intégration seul :

```bash
npm test -- test/pi-rpc.integration.test.ts
```

## Structure

- `src/` — interface React
- `server/manager.ts` — processus stable qui possède les sessions Pi
- `server/backend.ts` — API web et diffusion SSE
- `shared/` — contrats échangés entre les composants
- `test/` — test d’intégration avec l’installation Pi locale

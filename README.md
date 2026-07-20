# Pi Workbench

Pi Workbench est une interface web locale pour utiliser plusieurs sessions [Pi](https://github.com/earendil-works/pi) dans le même espace de travail. Elle conserve les sessions Pi indépendamment de l’interface : redémarrer le frontend ou le backend n’interrompt pas une session en cours.

L’application écoute uniquement sur `127.0.0.1` : elle n’est pas exposée au réseau.

## Ce que permet l’interface

- créer une session Pi ou rouvrir une session existante pour le dossier choisi ;
- converser avec Pi, suivre ses réponses et ses appels d’outils en direct ;
- utiliser les modèles, niveaux de réflexion et commandes disponibles dans Pi ;
- répondre aux dialogues d’extensions pris en charge ;
- consulter l’état Git, les diffs et les fichiers lus ou écrits par Pi ;
- committer et pousser les changements depuis le panneau Git.

> Pi peut lire, modifier et exécuter des commandes dans le dossier sélectionné. Utilisez un dépôt Git ou un autre mécanisme de sauvegarde avant de lui confier des changements importants.

## Fonctionnement

Le navigateur communique avec un backend HTTP local. Ce backend transmet les demandes à un gestionnaire distinct, seul responsable des processus `pi --mode rpc`. Cette séparation permet de mettre à jour l’interface sans perdre les sessions Pi actives.

Les sessions sont enregistrées par Pi. Après un redémarrage du gestionnaire, Pi Workbench les relance avec leur historique ; une réponse en cours au moment du redémarrage reste toutefois interrompue.

## Prérequis

- [Node.js](https://nodejs.org/) 24 ou supérieur ;
- npm ;
- Pi installé, configuré et disponible dans le `PATH` ;
- un compte connecté à un fournisseur de modèles ou une clé API configurée pour Pi.

Vérifiez l’installation :

```bash
node --version
npm --version
pi --version
```

### Installer et configurer Pi

Si Pi n’est pas encore installé :

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

Dans un terminal, lancez ensuite `pi`, puis utilisez `/login` pour vous connecter à un fournisseur. Consultez le [guide de démarrage de Pi](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/quickstart.md) pour les autres modes d’authentification et de configuration.

## Installation de Pi Workbench

Clonez le dépôt, puis installez ses dépendances :

```bash
git clone <repository-url>
cd pi-workbench
npm install
```

## Démarrer l’application

Pour le développement, une seule commande démarre le gestionnaire Pi, le backend et le frontend :

```bash
npm run dev
```

Ouvrez ensuite [http://127.0.0.1:5173](http://127.0.0.1:5173). Utilisez `Ctrl+C` dans le terminal pour arrêter les trois services.

### Construire et lancer la version de production

Construisez l’interface, puis démarrez le gestionnaire et le backend dans deux terminaux :

```bash
npm run build
```

```bash
# Terminal 1
npm run start:manager
```

```bash
# Terminal 2
npm run start:backend
```

L’interface est alors disponible sur [http://127.0.0.1:43121](http://127.0.0.1:43121).

## Première utilisation

1. Ouvrez l’application dans votre navigateur.
2. Cliquez sur **Dossier courant** et choisissez le dossier dans lequel Pi doit travailler.
3. Cliquez sur **Nouvelle session**.
4. Envoyez votre demande dans la zone de saisie, par exemple : « Analyse ce dépôt et indique comment exécuter ses contrôles. »
5. Suivez les réponses et les appels d’outils dans la conversation.

Les sessions récentes du dossier sélectionné s’affichent dans la barre latérale gauche. Cliquez sur l’une d’elles pour la reprendre. Le sélecteur d’agent apparaît seulement si votre installation Pi expose la commande correspondante.

## Git et aperçu de fichiers

Lorsqu’un dépôt Git est détecté dans le dossier courant, le panneau de droite affiche la branche, les fichiers modifiés, leurs diffs et les commits non poussés. Vous pouvez y saisir un message pour **committer et pousser** les changements.

Cette action exécute réellement les opérations Git dans le dossier sélectionné. Vérifiez le diff et la destination distante avant de confirmer.

Après un appel `read` ou `write` de Pi, le même panneau peut aussi afficher un aperçu du fichier concerné.

## Dépannage

| Symptôme | Vérification |
| --- | --- |
| `pi` est introuvable | Installez Pi, puis vérifiez que son répertoire d’installation est dans le `PATH` avec `pi --version`. |
| Pi ne répond pas ou aucun modèle n’est disponible | Lancez `pi` dans un terminal et terminez la configuration avec `/login`, ou configurez votre clé API. |
| La page ne s’ouvre pas | Vérifiez que `npm run dev` est toujours en cours et ouvrez exactement l’adresse affichée par Vite. |
| Le port est déjà utilisé | Arrêtez le processus qui utilise le port ou choisissez un autre port avec `PI_WORKBENCH_MANAGER_PORT` et `PI_WORKBENCH_BACKEND_PORT` avant le démarrage. |
| Une session ne se rouvre pas | Vérifiez que son dossier de travail existe toujours et que vous avez sélectionné ce même dossier dans l’interface. |

## Vérifications du projet

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Le test d’intégration nécessite une commande `pi` configurée. Pour l’exécuter seule :

```bash
npm test -- test/pi-rpc.integration.test.ts
```

## Structure du projet

- `src/` — interface React ;
- `server/manager.ts` — propriétaire des processus Pi ;
- `server/backend.ts` — API locale et diffusion des événements ;
- `shared/` — contrats échangés entre les composants ;
- `test/` — tests d’intégration.

# Présentations des appels d’outils

Les appels d’outils sont affichés par `ToolCallCard` dans `src/features/conversation/ToolCallCard.tsx`. La présentation dépend de `toolCallPresentation()` dans `src/features/conversation/tool-calls.ts`.

Par défaut, l’en-tête de l’outil expose son titre complet au survol. Une fois l’appel résolu, son statut affiche les nombres de caractères de ses arguments JSON sérialisés (`↘`) et de sa sortie textuelle brute (`↗`) ; ces valeurs restent détaillées au survol et au lecteur d’écran. Sa sortie affiche toujours un aperçu de quatre lignes ; un clic affiche la sortie complète, puis le clic suivant la masque. Les fichiers Markdown et de code lus ou écrits sont rendus dans leur format adapté. Une lecture HTML ouvre le fichier dans le navigateur avec son chemin Windows converti depuis WSL.

## Ajouter une présentation

1. Ajoutez au registre `toolCallPresentations` une entrée dont la clé est le nom RPC exact de l’outil.
2. Validez les arguments `unknown` dans sa fonction de présentation. Ne supposez jamais leur forme.
3. Retournez un `ToolCallPresentation` :
   - `headerDetail` affiche un détail compact dans l’en-tête ; fournissez le texte complet dans `title` pour le tooltip et le lecteur d’écran ;
   - `pendingDetail` complète uniquement l’état `En cours…`.
4. Ajoutez un test dans `test/tool-calls.test.ts` pour la présentation spécifique et pour son repli générique si les arguments sont invalides.

N’ajoutez une présentation que lorsqu’un outil apporte réellement une information plus lisible sous une autre forme.

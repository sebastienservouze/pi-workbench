# Présentations des appels d’outils

Les appels d’outils sont affichés par `ToolCallCard` dans `src/App.tsx`. La présentation dépend de `toolCallPresentation()` dans `src/tool-calls.ts`.

## Ajouter une présentation

1. Ajoutez au registre `toolCallPresentations` une entrée dont la clé est le nom RPC exact de l’outil.
2. Validez les arguments `unknown` dans sa fonction de présentation. Ne supposez jamais leur forme.
3. Retournez un `ToolCallPresentation` :
   - `headerDetail` affiche un détail compact dans l’en-tête ; fournissez le texte complet dans `title` pour le tooltip et le lecteur d’écran ;
   - `pendingDetail` complète uniquement l’état `En cours…` ;
   - `showInput` conserve ou masque le bloc d’arguments ;
   - `outputLabel` conserve le titre de la sortie ; omettez-le pour afficher la sortie directement.
4. Ajoutez un test dans `test/tool-calls.test.ts` pour la présentation spécifique et pour son repli générique si les arguments sont invalides.

Le repli générique conserve les blocs « Appel » et « Résultat ». N’ajoutez une présentation que lorsqu’un outil apporte réellement une information plus lisible sous une autre forme.

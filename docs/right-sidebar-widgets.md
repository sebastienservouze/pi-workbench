# Widgets de la sidebar droite

La sidebar droite s’affiche lorsqu’un dépôt Git est détecté ou lorsque des actions sont épinglées dans le rail. Elle est rendue par `RightSidebar` dans `src/features/git/RightSidebar.tsx` et reliée à l’état transversal par `src/App.tsx`.

## Composition et comportement

La sidebar est composée de deux zones côte à côte :

- un **panneau** à gauche, qui affiche le widget actif (actuellement Git uniquement) ;
- un **rail** permanent de 48 px à droite, qui porte les icônes des widgets et des actions.

Le clic sur l’icône d’un widget à panneau ouvre son panneau sans masquer le rail. Un second clic sur l’icône active referme le panneau. Le rail reste alors disponible pour rouvrir ce widget ou en choisir un autre.

Le widget Git conserve son état ouvert ou fermé dans `pi-workbench.git-sidebar-collapsed`. Son bouton renseigne `aria-expanded` et, lorsque le panneau est rendu, `aria-controls`.

### Widgets d’action (sans panneau)

Un widget peut être une simple action, sans panneau associé : il rend une icône dans le rail et exécute un callback au clic. Il n’a pas d’état ouvert/fermé et n’interagit pas avec le panneau.

Les actions sont passées au composant `RightSidebar` via la prop `railActions`, un tableau d’objets `{ key, icon, label, disabled?, onClick }`. Chaque action est rendue comme un bouton dans le rail, avec `aria-label` et `title` issus de `label`.

Exemple d’utilisation dans `App` :

```tsx
const railActions = useMemo(() => [
  {
    key: 'explorer',
    icon: <svg aria-hidden="true" …>…</svg>,
    label: 'Ouvrir le dossier dans l\'Explorateur',
    onClick: () => { void openExplorer(workspacePath).catch(…) },
  },
], [workspacePath])
```

Si aucune action n’est passée et qu’aucun dépôt Git n’est détecté, la sidebar droite n’est pas rendue.

### Prévisualisation Markdown

Les fichiers `.md` et `.markdown` ouverts par les outils `read` ou `write` sont rendus directement dans l’historique de la conversation (expansion inline du tool call). Les fichiers `.html` sont ouverts dans un nouvel onglet local. Aucun widget ni panneau n’est nécessaire pour ces formats.

## Contrat de mise en page

- Le panneau développé est redimensionnable entre 240 et 720 px. Sa valeur est locale au navigateur (`pi-workbench.git-sidebar-width`) et doit rester bornée avec `clampGitSidebarWidth` dans `src/features/git/git-sidebar.ts`.
- La largeur totale de la colonne ouverte inclut le panneau et le rail : `largeur du panneau + 48 px`.
- La poignée est un séparateur vertical accessible au pointeur et au clavier. Ne la rendez pas disponible quand le panneau est fermé. Les flèches gauche/droite, Début et Fin conservent leur sens et leurs bornes.
- Sous 850 px, le panneau fait 260 px et le rail 48 px. Sous 700 px, la mise en page devient verticale : le panneau reste limité à `38dvh` et le rail reste visible à sa droite.
- Le contenu défilant porte `min-height: 0`, `flex: 1` et `overflow: auto`. Les actions en bas de panneau restent hors de cette zone de défilement.
- Réutilisez les variables de `src/styles/base.css` (`--surface`, `--line`, `--muted`, `--teal`, etc.) et les styles de `src/features/git/git.css`. N’ajoutez pas de bibliothèque UI.

La structure CSS actuelle est volontairement minimale : `.git-sidebar` aligne `.git-widget-panel` et `.git-rail`, tandis que `.git-panel` porte le contenu défilant. Préservez cette séparation : le rail ne doit jamais être un enfant du contenu défilant.

## Ajouter un widget

N’ajoutez ni registre, ni système de plugins, ni gestionnaire d’état pour un seul widget. Le Git est aujourd’hui le seul widget à panneau.

### Widget à panneau

1. Vérifiez que l’information existe déjà dans le snapshot Git, une API HTTP existante ou le flux SSE. Sinon, ajoutez l’API minimale côté backend avant le composant React.
2. Créez un composant local seulement si le widget a une responsabilité propre. Gardez ses identifiants, props et son code en anglais ; gardez la copie visible en français. Choisissez une icône simple et cohérente avec la responsabilité du widget, en privilégiant les glyphes Unicode déjà utilisés dans le rail. Utilisez une marque seulement si le widget représente réellement ce service ; si aucune icône ne s’impose, demandez la préférence de l’utilisateur.
3. Ajoutez l’état dans `App` (un `useState` pour le widget actif) et passez-le à `RightSidebar` avec les props nécessaires. Le rail rend une icône par widget ; le panneau conditionnel affiche le widget actif.
4. Gardez la largeur et la poignée sur le panneau, jamais sur le rail. Conservez les préférences locales Git tant que le widget Git les utilise.
5. Prévoyez les états chargement, vide et erreur. Les actions sont des éléments natifs, nommés par `aria-label` si leur texte ne suffit pas, et atteignables au clavier. Chaque icône du rail doit avoir une cible d’au moins 44 × 44 px, `aria-expanded` et un libellé décrivant l’action.
6. Préservez la lecture sur petits écrans : contenu tronqué avec ellipsis si nécessaire, pas de largeur minimale supérieure à celle du panneau et pas de scrollbar imbriquée inutile.

### Widget d’action (sans panneau)

1. Ajoutez une entrée dans le tableau `railActions` passé à `RightSidebar`. Chaque entrée est un objet `RailAction` :
   ```ts
   interface RailAction {
     key: string       // identifiant unique dans le rail
     icon: ReactNode   // icône rendue dans le bouton (max ~20×20 px)
     label: string     // libellé pour aria-label et title
     disabled?: boolean // désactive le bouton si true
     onClick: () => void // callback exécuté au clic
   }
   ```
2. Si l’action dépend du `workspacePath` ou d’un état réactif, construisez le tableau avec `useMemo` pour éviter les re-rendus inutiles.
3. L’action ne peut pas ouvrir de panneau. Si un panneau est nécessaire, créez un widget à panneau.
4. Le bouton hérite des styles `.rail-tab` existants. Aucun CSS supplémentaire n’est requis, sauf si l’icône a besoin d’un ajustement mineur (ex. `letter-spacing` pour un glyphe texte).

## Validation

- Ajoutez le plus petit test Node utile à toute logique non triviale, à côté des tests existants dans `test/`.
- Exécutez `npm test`, `npm run lint` et `npm run build`.
- Vérifiez manuellement l’ouverture et la fermeture depuis le rail, le changement entre widgets, la largeur mémorisée après rechargement, le glisser et le clavier de la poignée, ainsi que les deux breakpoints de la sidebar.

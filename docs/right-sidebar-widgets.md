# Widgets de la sidebar droite

La sidebar droite s’affiche lorsqu’un dépôt Git est détecté ou lorsqu’un fichier doit être prévisualisé. Elle affiche actuellement les widgets Git et Fichier, rendus par `RightSidebar` dans `src/App.tsx`.

## Composition et comportement

La sidebar est composée de deux zones côte à côte :

- un **panneau** à gauche, qui affiche le widget actif ;
- un **rail** permanent de 48 px à droite, qui porte les icônes des widgets.

Le clic sur l’icône d’un widget ouvre son panneau sans masquer le rail. Un second clic sur l’icône active referme le panneau. Le rail reste alors disponible pour rouvrir ce widget ou en choisir un autre.

Le widget Git conserve son état ouvert ou fermé dans `pi-workbench.git-sidebar-collapsed`. Son bouton renseigne `aria-expanded` et, lorsque le panneau est rendu, `aria-controls`.

## Contrat de mise en page

- Le panneau développé est redimensionnable entre 240 et 480 px. Sa valeur est locale au navigateur (`pi-workbench.git-sidebar-width`) et doit rester bornée avec `clampGitSidebarWidth` dans `src/git-sidebar.ts`.
- La largeur totale de la colonne ouverte inclut le panneau et le rail : `largeur du panneau + 48 px`.
- La poignée est un séparateur vertical accessible au pointeur et au clavier. Ne la rendez pas disponible quand le panneau est fermé. Les flèches gauche/droite, Début et Fin conservent leur sens et leurs bornes.
- Sous 850 px, le panneau fait 260 px et le rail 48 px. Sous 700 px, la mise en page devient verticale : le panneau reste limité à `38dvh` et le rail reste visible à sa droite.
- Le contenu défilant porte `min-height: 0`, `flex: 1` et `overflow: auto`. Les actions en bas de panneau restent hors de cette zone de défilement.
- Réutilisez les variables de `src/App.css` (`--surface`, `--line`, `--muted`, `--teal`, etc.) et les styles de contrôles existants. N’ajoutez pas de bibliothèque UI.

La structure CSS actuelle est volontairement minimale : `.git-sidebar` aligne `.git-widget-panel` et `.git-rail`, tandis que `.git-panel` porte le contenu défilant. Préservez cette séparation : le rail ne doit jamais être un enfant du contenu défilant.

## Ajouter un widget

N’ajoutez ni registre, ni système de plugins, ni gestionnaire d’état pour un seul widget. Le Git est aujourd’hui le seul cas réel.

1. Vérifiez que l’information existe déjà dans le snapshot Git, une API HTTP existante ou le flux SSE. Sinon, ajoutez l’API minimale côté backend avant le composant React.
2. Créez un composant local seulement si le widget a une responsabilité propre. Gardez ses identifiants, props et son code en anglais ; gardez la copie visible en français. Choisissez une icône simple et cohérente avec la responsabilité du widget, en privilégiant les glyphes Unicode déjà utilisés dans le rail. Utilisez une marque seulement si le widget représente réellement ce service ; si aucune icône ne s’impose, demandez la préférence de l’utilisateur.
3. Lorsqu’un second widget existe réellement, remplacez `GitSidebar` par un conteneur explicite et simple qui :
   - conserve l’identifiant du widget actif ou l’absence de panneau ;
   - rend une icône par widget dans le rail permanent ;
   - affiche le panneau du widget actif à gauche du rail ;
   - ferme le panneau au second clic sur son icône et ouvre directement un autre widget au clic sur son icône.
4. Gardez la largeur et la poignée sur le panneau, jamais sur le rail. Conservez les préférences locales Git tant que le widget Git les utilise.
5. Prévoyez les états chargement, vide et erreur. Les actions sont des éléments natifs, nommés par `aria-label` si leur texte ne suffit pas, et atteignables au clavier. Chaque icône du rail doit avoir une cible d’au moins 44 × 44 px, `aria-expanded` et un libellé décrivant l’action.
6. Préservez la lecture sur petits écrans : contenu tronqué avec ellipsis si nécessaire, pas de largeur minimale supérieure à celle du panneau et pas de scrollbar imbriquée inutile.

## Validation

- Ajoutez le plus petit test Node utile à toute logique non triviale, à côté des tests existants dans `test/`.
- Exécutez `npm test`, `npm run lint` et `npm run build`.
- Vérifiez manuellement l’ouverture et la fermeture depuis le rail, le changement entre widgets, la largeur mémorisée après rechargement, le glisser et le clavier de la poignée, ainsi que les deux breakpoints de la sidebar.

# Widgets de la sidebar droite

La sidebar droite affiche aujourd’hui le panneau Git. Elle est rendue par `GitSidebar` dans `src/App.tsx` et ne devient visible que lorsqu’un dépôt Git est détecté.

## Contrat de la sidebar

- Le panneau développé est redimensionnable entre 240 et 480 px. Sa valeur est locale au navigateur (`pi-workbench.git-sidebar-width`) et doit rester bornée avec `clampGitSidebarWidth` dans `src/git-sidebar.ts`.
- La poignée est un séparateur vertical accessible au pointeur et au clavier. Ne la rendez pas disponible quand le panneau est réduit. Les flèches gauche/droite, Début et Fin doivent conserver leur sens et leurs bornes.
- Sous 850 px, la largeur est volontairement fixe à 260 px pour préserver l’espace de travail ; sous 700 px, la mise en page devient verticale. Un widget ne doit pas contourner ces règles.
- Le contenu défilant porte `min-height: 0` et `overflow: auto`. Un widget ne doit pas imposer une hauteur qui expulse les actions de bas de panneau.

## Ajouter un widget

N’ajoutez pas de registre, de système de plugins ou de gestionnaire d’état pour un seul widget. Le panneau Git est le seul cas réel à ce jour.

1. Vérifiez que l’information n’existe pas déjà dans le snapshot Git, une API HTTP existante ou le flux SSE. Sinon, ajoutez l’API minimale côté backend avant le composant React.
2. Créez un composant local seulement si le widget a une responsabilité propre. Gardez ses identifiants, props et son code en anglais ; gardez la copie visible en français.
3. Intégrez-le dans la sidebar développée sans modifier le rail réduit. S’il faut plusieurs widgets indépendants, introduisez alors — dans la même modification — un conteneur explicite et simple qui remplace `GitSidebar`.
4. Réutilisez les variables de `src/App.css` (`--surface`, `--line`, `--muted`, `--teal`, etc.) et les styles de contrôles existants. N’ajoutez pas de bibliothèque UI.
5. Prévoyez les états chargement, vide et erreur. Les actions doivent être des éléments natifs, nommés par `aria-label` si leur texte ne suffit pas, et atteignables au clavier.
6. Préservez la lecture sur petits écrans : contenu tronqué avec ellipsis si nécessaire, pas de largeur minimale supérieure à celle de la sidebar, et pas de scrollbar imbriquée inutile.

## Validation

- Ajoutez le plus petit test Node utile à toute logique non triviale, à côté des tests existants dans `test/`.
- Exécutez `npm run typecheck`, `npm run lint` et `npm run build`.
- Vérifiez manuellement le panneau développé, le rail réduit, la largeur mémorisée après rechargement, le glisser et le clavier de la poignée, ainsi que les deux breakpoints de la sidebar.

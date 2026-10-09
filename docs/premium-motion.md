# EasyWine — Signature UX premium

Édition 1 · Interface bordeaux et ivoire, dans la continuité du brief d'origine.

## Principes

Luxe = précision, sobriété et réactivité. Pas d'animation qui ajoute artificiellement une seconde aux opérations ; l'interface s'affiche dès que les données réelles sont prêtes. Les recommandations restent déterministes et ne décrémentent jamais automatiquement les stocks.

## Motion design : le verre EasyWine

- Verre SVG V3 : calice symétrique avec liseré, verre translucide, dégradé de vin bordeaux **#682c3c**, reflet de pied, légère caustique. Sur bouton primaire bordeaux, tracé ivoire et vin rosé pour garder du contraste.
- **Montée géométriquement correcte** : le liquide et son ménisque sont dans un groupe SVG translaté qui est découpé par le contour intérieur exact du calice. Le vin remplit donc le bas du verre avant le haut, sans débordement ni fausse superposition des courbes. Après le premier remplissage, le niveau oscille de moins d'un pixel **tant que le loader est monté**.
- Les dégradés et le masque sont embarqués dans chaque verre (premier écran immédiatement lisible sans JS) ; les identifiants de chaque clone SVG sont uniques pour éviter les collisions de `clipPath` et de gradients entre plusieurs boutons.
- Pas de GSAP, anime.js ni WebGL ajouté à l'exécution : leurs techniques de trajectoires/morphing ont servi à l'étude. Sur une icône si petite, ils augmenteraient les octets téléchargés, les contextes à créer et la complexité du cleanup, sans apporter un avantage mesuré. Aucune boucle `requestAnimationFrame` ajoutée.
- Aucune boucle de remplissage artificielle ni faux pourcentage : l'indicateur reste indéterminé ; il ne représente pas le progrès HTTP en octets.
- À l'ouverture, la vérification de session et le chargement parallèle de la cave et de la carte conservent un seul écran de marque. Les libellés n'avancent **qu'après l'achèvement réel** de chaque réponse HTTP ; la navigation n'est affichée qu'une fois les deux jeux de données disponibles.
- Pour les chargements de rubriques, imports et sauvegardes, l'indicateur reste visible jusqu'à la résolution effective de l'opération. Après 2,8 s, un texte discret signale la lenteur de réponse sans prétendre mesurer un pourcentage ni retarder la fin. Les échecs se terminent par une erreur réelle et une possibilité de reprise adaptée.
- Le même actif intégré dans le HTML sert à trois échelles : **hero** à l'ouverture, **inline** pendant un changement de rubrique ou une recommandation, **mini** pendant une sauvegarde ou une vérification CSV. Le mini-verre respire de 1,25 px en cours de traitement, avec le libellé conservé en opacité pleine même lorsque le bouton est désactivé pour éviter une double soumission.
- Aucun GIF, bibliothèque tierce, police distante ni fichier réseau supplémentaire. Le chargement du premier écran fonctionne sans JavaScript jusqu'à la résolution du script.
- `prefers-reduced-motion: reduce` : le verre est statique et rempli (reflets visibles), sans oscillation. Toutes les animations de carte ou toast sont également arrêtées.
- Une interruption réseau n'affiche jamais une progression inventée. Le message reste contextualisé et propose une issue.

## Retours d'interaction

| Action | Retour en cours | Confirmation vraie | Erreur |
| --- | --- | --- | --- |
| Connexion et MFA | Mini-verre et libellé de validation, bouton désactivé | Ouverture réelle de l'espace après chargement des données | Message explicite, saisie conservée |
| Conseil mets-vins | Verre inline dans la zone résultat, bouton en cours | Nombre de suggestions effectivement retournées | Erreur de recommandation avec reprise |
| Choix du client | Bouton en cours | Choix enregistré, **stock inchangé** tant que la vente n'a pas été confirmée manuellement | Aucune confirmation fictive |
| Vin/plat/stock | Bouton de modale verrouillé et mini-verre | Retour de sauvegarde puis actualisation des données | Formulaire non fermé, erreur persistante et fermable |
| Import CSV | Mini-verre pendant la prévisualisation | Fichier vérifié et nombre réel de références valides | Erreurs de lignes / échec réseau ; pas d'import fantôme |
| Compte et MFA | Validation en cours | Nouveau mot de passe, 2FA activée ou désactivée seulement après HTTP réussi | Aucune supposition de réussite |

## Notifications

Le toast est un élément sobre en ivoire, encre foncée et liseré bordeaux, avec état succès/info/erreur, fermeture clavier et annonce `status` ou `alert`. Un succès disparaît après 4,6 s ; **une erreur attend sa fermeture**, sans retirer les données saisies. Quand un dialogue modal est ouvert, les erreurs s'affichent dans sa couche d'affichage, devant son backdrop.

Aucune notification de « succès » ne doit être affichée avant la réponse métier réussie, et aucune écriture n'est automatiquement rejouée après un timeout ambigu.

## Contrôle qualité reproductible

- `tests/browser-premium.mjs` : vérifie le premier rendu SVG, l'animation, l'état busy des sauvegardes, toast succès/erreur, la prévisualisation CSV, les recommandations, la réduction des mouvements et l'absence d'overflow mobile.
- `tests/browser-a11y.mjs` : barrière axe-core WCAG 2.2 A/AA sur 14 écrans d'EasyWine.
- Tests existants : réseau, isolation de sessions, MFA, 2 400 vins, parcours initial et navigateur mobile.
- Sandbox Windows : trois tailles, capture et mesure des débordements, sans données réelles.

**Ne pas confondre** test de laboratoire et session terrain. Les délais, INP p75, lecteurs d'écran et perception des utilisateurs de salle doivent encore être validés sur appareils, réseaux et équipes réels avant certification du produit.

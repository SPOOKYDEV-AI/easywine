# EasyWine — Signature UX premium

Édition 1 · Interface bordeaux et ivoire, dans la continuité du brief d'origine.

## Principes

Luxe = précision, sobriété et réactivité. Pas d'animation qui ajoute artificiellement une seconde aux opérations ; l'interface s'affiche dès que les données réelles sont prêtes. Les recommandations restent déterministes et ne décrémentent jamais automatiquement les stocks.

## Motion design : le verre EasyWine

- Forme vectorielle légère, tracé fin, verre sur fond ivoire ; vin bordeaux **#682c3c**.
- Le liquide monte une fois, sans pourcentage fictif. L'animation est **indéterminée** ; elle ne représente pas le progrès réel d'une requête HTTP.
- Le même actif intégré dans le HTML sert à trois échelles : **hero** à l'ouverture, **inline** pendant un changement de rubrique ou une recommandation, **mini** pendant une sauvegarde ou une vérification CSV.
- Aucun GIF, bibliothèque tierce, police distante ni fichier réseau supplémentaire. Le chargement du premier écran fonctionne sans JavaScript jusqu'à la résolution du script.
- `prefers-reduced-motion: reduce` : le verre est statique et rempli. Toutes les animations de carte ou toast sont également arrêtées.
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

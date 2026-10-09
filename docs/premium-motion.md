# EasyWine — Signature UX premium

Édition 1 · Interface bordeaux et ivoire, dans la continuité du brief d'origine.

## Principes

Luxe = précision, sobriété et réactivité. Pas d'animation qui ajoute artificiellement une seconde aux opérations ; l'interface s'affiche dès que les données réelles sont prêtes. Les recommandations restent déterministes et ne décrémentent jamais automatiquement les stocks.

## Motion design : le verre EasyWine

- **V6 lumière maîtrisée** : gradient longitudinal à cinq arrêts sur le ménisque, qui remplace un trait uni et évite les extrémités visuellement trop nettes ; discret reflet de profondeur côté opposé dans le vin. Le halo interne dérive de moins d'un pixel à faible amplitude d'opacité tant qu'une opération est en cours. Aucun nouvel asset ou chargement externe ; la version miniature supprime les micro-reflets. Arrêt complet avec `prefers-reduced-motion`.\n- **V5 cristal raffiné** : enrichissement de la V4 par une double lecture du ménisque, un reflet spéculaire longitudinal effilé, une seconde facette de réfraction côté droit et un reflet de la face intérieure du buvant. Les détails sont cachés sur le format mini pour éviter une texture illisible.
- **V4 cristal** : calice de dégustation redessiné (parois fines et bombées, buvant elliptique en perspective, double épaisseur de verre, refraction des parois), vin Bordeaux profond avec gradient longitudinal à cinq arrêts, reflet volumétrique radial, pied effilé et socle elliptique ombré. Design comparé à des formes de verrerie premium réelles : le dessin est une illustration vectorielle originale, pas une reproduction de produit. Sur bouton primaire bordeaux, vin rosé et monture ivoire assurent la lisibilité.
- Le format hero utilise une composition 120×180 unités (136×204 px desktop), le petit verre conserve la même silhouette mais supprime les micro-reflets inutiles à 18 px. Deux gradients radiaux et un masque géométrique sont embarqués ; aucune image ni bibliothèque de rendu externe.
- **Montée géométriquement correcte** : le liquide et son ménisque sont dans un groupe SVG translaté (70 unités), découpé par le contour intérieur du calice. Le vin remplit donc le bas du verre avant le haut, sans débordement ni fausse superposition des courbes. Après le premier remplissage, le niveau oscille de moins d'un pixel **tant que le loader est monté**.
- Les dégradés et le masque sont embarqués dans chaque verre (premier écran immédiatement lisible sans JS) ; les identifiants de chaque clone SVG sont uniques pour éviter les collisions de `clipPath` et de gradients entre plusieurs boutons.
- Pas de GSAP, anime.js ni WebGL ajouté à l'exécution : leurs techniques de trajectoires/morphing ont servi à l'étude. Sur une icône si petite, ils augmenteraient les octets téléchargés, les contextes à créer et la complexité du cleanup, sans apporter un avantage mesuré. Aucune boucle `requestAnimationFrame` ajoutée.
- Aucune boucle de remplissage artificielle ni faux pourcentage : l'indicateur reste indéterminé ; il ne représente pas le progrès HTTP en octets.
- À l'ouverture, la vérification de session et le chargement parallèle de la cave et de la carte conservent un seul écran de marque. Les libellés n'avancent **qu'après l'achèvement réel** de chaque réponse HTTP ; la navigation n'est affichée qu'une fois les deux jeux de données disponibles.
- Pour les chargements de rubriques, imports et sauvegardes, l'indicateur reste visible jusqu'à la résolution effective de l'opération. Après 2,8 s, un texte discret signale la lenteur de réponse sans prétendre mesurer un pourcentage ni retarder la fin. Les échecs se terminent par une erreur réelle et une possibilité de reprise adaptée.
- Le même actif intégré dans le HTML sert à trois échelles : **hero** à l'ouverture, **inline** pendant un changement de rubrique ou une recommandation, **mini** pendant une sauvegarde ou une vérification CSV. Le mini-verre respire de 1,25 px en cours de traitement, avec le libellé conservé en opacité pleine même lorsque le bouton est désactivé pour éviter une double soumission.
- Aucun GIF, bibliothèque tierce, police distante ni fichier réseau supplémentaire. Le chargement du premier écran fonctionne sans JavaScript jusqu'à la résolution du script.
- `prefers-reduced-motion: reduce` : le verre est statique et rempli (reflets visibles), sans oscillation. Toutes les animations de carte ou toast sont également arrêtées.
- Une interruption réseau n'affiche jamais une progression inventée. Le message reste contextualisé et propose une issue.

## Navigation fluide — écran immédiatement utile

- Le rendu d'une vue dont le module et les données sont déjà disponibles est **commité directement** sans afficher fugitivement l'écran de chargement.
- La navigation ne remplace le contenu précédent par le verre de chargement **qu'après 120 ms d'attente effective**. Ce seuil ne ralentit ni les API ni la peinture d'une vue rapide ; il supprime uniquement le clignotement des chargements imperceptibles.
- Pendant la résolution, le panneau précédent devient `inert` pour empêcher les actions sur des données d'une rubrique non active ; le menu reste navigable, et l'indicateur `aria-busy` reste exact.
- Les modules sont préparés sur survol souris / focus clavier **uniquement pour les sessions autorisées**. Aucune prélecture de données serveur ni de module d'administration pour un invité.
- Les clics répétés sur la rubrique déjà chargée n'entraînent plus de reconstruction du DOM ou de requêtes inutiles. Les actualisations après sauvegarde utilisent `force:true` pour ne pas ignorer les vraies mises à jour.
- Une transition d'entrée de 4 px / environ 200 ms, seulement sur les grands conteneurs et **sans baisse d'opacité du texte** (contraste WCAG conservé pendant le mouvement), harmonise les changements de vues sans animer les centaines de lignes d'inventaire. `prefers-reduced-motion` désactive ces transitions.
- À la déconnexion et avant toute nouvelle connexion, l'ancienne interface est réellement vidée du DOM, y compris si une ancienne requête finit tardivement.

## Robustesse de l'exploitation sur tablette partagée

- **Sécurité côté serveur** : toute session HTTP inactive pendant plus de **15 minutes** est refusée puis éliminée de la table des sessions, même si l'appareil était hors ligne ou en veille. La limite absolue de 12 heures reste en vigueur. Un nouveau login explicite est requis, sans récupération automatique par la même session.
- **Confidentialité locale** : avertissement après **8 minutes** sans interaction sur l'appareil ; verrouillage local après **10 minutes**, effacement immédiat du DOM de l'établissement, puis tentative de révocation distante. La barrière persistante `easywine:shared-device-locked` empêche une reprise silencieuse au rechargement, même si le cookie HttpOnly n'a pas pu être effacé en mode hors ligne. Le marqueur n'est pas un secret.
- **Limite explicite** : l'interface ne peut pas supprimer un cookie HttpOnly ni révoquer un jeton sur le serveur quand le réseau est totalement indisponible. C'est la raison de l'expiration côté serveur et de l'interdiction de reprendre automatiquement sans authentification.
- **Perte de réponse réseau** : les recherches envoyées avec un `requestKey` UUID sont enregistrées atomiquement avec une réponse de référence pendant deux heures. Une relance explicite du même geste et des mêmes critères renvoie cette réponse sans enregistrer deux sessions de propositions ; un autre jeu de critères avec la même clé renvoie **409**. Le choix du vin et les mouvements de stock conservent leurs règles d'idempotence existantes.
- **Confidentialité** : la clé de requête ne contient aucune donnée client. Le registre de réponse est limité à deux heures et isolé par établissement **et employé**. La réponse déjà enregistrée n'est pas une preuve de disponibilité actuelle du stock : la confirmation d'un choix vérifie toujours sa disponibilité.
- **Mise à niveau** : migration SQLite explicite **v4 vers v5** avec transaction et sans destruction des données métier ; les sessions déjà ouvertes reçoivent une seule fenêtre d'inactivité au moment de la migration, sans prolonger leur date absolue d'expiration.
- **Avant déploiement sur terminaux réels** : essais physiques de mise en veille/réveil, redémarrage, Wi-Fi perdu, MDM/kiosque, perte/vol, gestion des comptes employés et exigences de l'établissement.

## Tablettes de prise de commande — parcours en salle

- **Format tactile de 7 à 10 pouces** : pour les écrans à pointeur imprécis jusqu'à 1100 px CSS de large, la barre de navigation atteint le bas de l'écran à portée du pouce ; la colonne latérale ne réduit plus la surface de conseil. Un appareil doté d'un pointeur précis sans fonction tactile garde la navigation desktop. La version paysage d'au moins 960 px utilise deux colonnes pour maintenir la sélection et les accords visibles côte à côte.
- **Cibles tactiles de 48 px minimum** pour les commandes courantes et puces de préférences ; sélecteurs de 50 px et typographie de 16 px pour les saisies. La décision est liée au périphérique tactile via `any-pointer:coarse`, et non simplement à l'orientation ou à une hypothèse de modèle matériel.
- **Wi-Fi instable et changements de critères** : une sélection modifiée annule sa requête de recommandation précédente, libère le bouton et supprime le résultat obsolète sans annoncer de panne réseau. Une nouvelle recherche peut être déclenchée sans attendre le timeout. Aucune répétition automatique de transaction n'est effectuée.
- **Changement de session** : une réponse ou un corps HTTP reçu après déconnexion est rejeté avant de devenir une confirmation dans la nouvelle session. Le client ne doit jamais afficher une validation associée à un autre établissement.
- **En exploitation réelle** : il faudra confirmer modèle de tablette, OS/versions, MDM/kiosque, Wi-Fi de salle, extinction et réveil, taille effective en pixels CSS, clavier virtuel, SLA métier et sécurité des appareils partagés. Les simulations Chrome ne valent pas tests physiques.
- **Hors périmètre validé** : pas de véritable mode hors-ligne avec file d'écritures (risque de stock et de doublons), ni promesse de compatibilité avec un système de commande propriétaire sans API/protocole documenté.

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

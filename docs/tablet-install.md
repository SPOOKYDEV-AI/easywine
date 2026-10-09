# EasyWine — installation sur tablettes de commande

## Objectif

Déployer EasyWine comme interface de conseil dédiée sur des terminaux tactiles
de 7 à 10 pouces sans sacrifier la confidentialité des restaurants ni inventer
un mode hors-ligne qui afficherait des stocks périmés.

## Installation

- L'application expose `/manifest.webmanifest` avec un identifiant stable
  `/`, un démarrage `/`, la portée `/`, le mode `standalone` et
  `orientation: any` : les équipiers peuvent basculer entre portrait/paysage.
- Des icônes PNG réelles de 192 et 512 px, et une icône `maskable` de 512 px
  sont exposées avec les types MIME corrects. L'icône Apple 180 px est incluse.
- Installer depuis un navigateur compatible sur un serveur HTTPS. En local,
  `localhost` / `127.0.0.1` est accepté pour les tests ; une IP privée en
  HTTP n'est PAS une origine de production installable.
- Android Chrome/Edge : ouvrir l'URL HTTPS, utiliser l'action d'installation
  du navigateur. iPadOS Safari : Partager → Sur l'écran d'accueil, selon la
  version du navigateur/OS. L'invite et l'intégration MDM varient selon le parc.
- L'icône n'est pas un mécanisme d'authentification : la connexion de chaque
  employé reste individuelle, et la session expire après inactivité.

## Réseau, stockage et mise à jour

- **Pas de service worker inscrit par EasyWine**, pas de `CacheStorage` métier,
  pas de file d'attente d'écritures. En cas de coupure, les appels API échouent
  clairement au lieu d'afficher silencieusement une cave ancienne.
- Les réponses JSON /api/* sont `Cache-Control: no-store`.
  Les assets publics peuvent être revalidés avec leur ETag (et non recouverts
  par un cache applicatif permanent).
- Le chargement initial et les nouvelles sessions exigent le serveur. Les
  mouvements de stock et choix de vin ne sont **jamais** rejoués automatiquement.
- Verrou de confidentialité local après 10 minutes sans interaction et
  refus serveur après 15 minutes d'inactivité, y compris après veille.

## Checklist de recette sur matériel réel (non encore attestée)

- Référencer marque, modèle, OS, navigateur, dimensions CSS, densité et mémoire,
  versions supportées et fréquence de mise à jour.
- Valider HTTPS et les certificats, Wi-Fi de salle/cuisine/terrasse, roaming,
  latence maximale, réveil, rotations répétées et clavier virtuel.
- Déterminer la politique de kiosque/MDM : restrictions de navigation,
  renouvellement des sessions, installation, mises à jour forcées, effacement
  distant, vol/perte et remise à zéro avant réaffectation.
- Tester une recherche avec Wi-Fi interrompu, une nouvelle tentative avec clé
  identique, et une confirmation de vin après modification de stock.
- Tester perte réseau **pendant** une déconnexion : le cookie HttpOnly peut
  subsister sur le serveur tant que son expiration n'est pas atteinte ; le
  marqueur de verrouillage local bloque la reprise silencieuse de l'interface.
- Identifier le logiciel de caisse et son API/SDK avant toute synchronisation
  de commandes : aucune intégration POS n'est garantie aujourd'hui.

## Prérequis pour certification terrain

Pour déclarer un modèle de tablette *supporté*, archiver une campagne de tests
sur **chaque modèle/OS/navigateur cible**, avec captures, versions, réseau,
rétablissement de veille, durées réelles, ergonomie avec gestes tactiles,
et autorisation du responsable de l'établissement.

## Références

- MDN — Making PWAs installable:
  https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- Chrome — Web app manifest installability:
  https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest

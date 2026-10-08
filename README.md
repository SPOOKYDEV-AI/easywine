# EasyWine — accords mets & vins, sans dépendance à l'IA

EasyWine aide le personnel de salle à recommander rapidement des bouteilles **réellement présentes dans la cave de son restaurant**. L'accord classique reste sous le contrôle du restaurateur. Les recommandations sont explicables, filtrées par les préférences et le stock, et le prix n'entre jamais dans le calcul de compatibilité.

## État de cette version

- Interface tactile en français : plat → envies → couleur → budget (facultatif) → recommandations et phrase à dire.
- Gestion des vins, du stock, des plats, des accords classiques, des comptes et de l'historique.
- Import de cave CSV avec aperçu, validation stricte, refus des doublons et transaction atomique (500 références par lot maximum).
- Authentification par session HTTP-only, rôles owner / manager / staff, vérifications serveur tenant par tenant.
- Base SQLite transactionnelle avec WAL, migrations versionnées, sauvegardes vérifiées, contrôle de version optimiste et journal d'audit.
- Révocation immédiate des comptes, changement de mot de passe et invalidation des sessions.
- Exclusions d'accords configurables par plat, suivis des propositions affichées et des vins sélectionnés.
- Mouvements de stock justifiés et historisés (réapprovisionnement, consommation, perte, correction), protection contre les retries et les doubles déductions.
- Algorithme déterministe, sans API payante et sans promesse de sommellerie automatisée.

## Pré-requis

Node.js **22.16 ou supérieur** (ou une branche LTS suivante avec node:sqlite), navigateur moderne. Aucune dépendance npm externe, aucun conteneur requis.

## Démarrage local

1. Cloner le dépôt et sélectionner la branche de travail (ou main après validation de la PR).
2. Créer au moins un établissement et son compte propriétaire.
3. Lancer le serveur puis ouvrir http://127.0.0.1:3000.

Exemple Linux/macOS (ne pas inscrire le mot de passe dans les paramètres de commande) :

    read -rsp 'Mot de passe initial : ' EASYWINE_BOOTSTRAP_PASSWORD; echo
    export EASYWINE_BOOTSTRAP_PASSWORD
    npm run bootstrap -- --slug maison-demo --name 'Maison Démo' --email admin@exemple.fr --owner Responsable
    unset EASYWINE_BOOTSTRAP_PASSWORD
    npm start

Exemple PowerShell (saisie masquée) :

    $secret = Read-Host 'Mot de passe initial' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try {
      $env:EASYWINE_BOOTSTRAP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
      npm run bootstrap -- --slug maison-demo --name 'Maison Démo' --email admin@exemple.fr --owner Responsable
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
      Remove-Item Env:EASYWINE_BOOTSTRAP_PASSWORD -ErrorAction SilentlyContinue
    }
    npm start

Le secret initial doit comporter au minimum 12 caractères. Les données sont créées sous .data/easywine.sqlite (hors Git). Aucun compte, vin ou plat fictif n'est injecté au démarrage.

## Configuration

| Variable | Usage | Défaut |
|---|---|---|
| PORT | Port HTTP | 3000 |
| HOST | Adresse d'écoute | 127.0.0.1 |
| EASYWINE_DB | Chemin du fichier SQLite | .data/easywine.sqlite |
| NODE_ENV | Mode production si production | développement |
| EASYWINE_ORIGIN | Origine publique HTTPS **obligatoire en production** | aucune |
| EASYWINE_BOOTSTRAP_PASSWORD | Mot de passe temporaire de provisionnement, à retirer aussitôt | aucune |

**Production :** placer le processus derrière un proxy HTTPS correctement configuré, avec stockage persistant privé et sauvegardes cohérentes via la commande de maintenance intégrée. Le mode production active le cookie Secure. Ne pas exposer directement le port HTTP sur Internet.

## Import CSV de cave

Depuis Ma cave → Importer CSV, choisissez un fichier encodé en UTF-8. Séparateurs point-virgule ou virgule, champs entre guillemets acceptés. L'aperçu doit être sans erreur avant confirmation.

En-têtes obligatoires :

    producer;cuvee;color;body;acidity;tannin;aromatic;price_eur;stock

En-têtes optionnels : appellation, vintage, region, grapes, tags (séparés par |), by_glass, active. Les profils body / acidity / tannin / aromatic doivent être saisis sur une échelle 1–5 : le moteur ne les invente pas. price_eur est exprimé en euros (ex. 85,50). Les doublons sont contrôlés par producteur + cuvée + millésime dans un même établissement. Un lot invalide est entièrement rejeté.


## Sauvegardes chiffrées (AES-256-GCM)

Préférer les sauvegardes `.ewb` authentifiées à la sortie en clair : elles se vérifient avant toute restauration. Les sauvegardes utilisent le moteur SQLite (WAL inclus), puis un chiffrement AES-256-GCM avec IV aléatoire par archive. Le mot de passe des utilisateurs **ne remplace jamais** la clé de sauvegarde.

Créer une clé aléatoire de 32 octets dans un fichier privé **hors dépôt Git et hors répertoire public** (une seule fois) :

    node -e "const fs=require('node:fs'),c=require('node:crypto');fs.writeFileSync(process.argv[1],c.randomBytes(32).toString('hex')+'\\n',{flag:'wx',mode:0o600})" /dossier-prive/easywine-backup.key

Sous Unix, le fichier doit appartenir au compte de service et être lisible uniquement par lui (`chmod 600`). Sous Windows, **contrôler réellement les ACL NTFS** : le mode 0600 Node.js ne garantit pas l'isolement. Stocker une copie de la clé dans un gestionnaire de secrets distinct des sauvegardes, avec une procédure de récupération testée.

Configurer le chemin de clé dans `EASYWINE_BACKUP_KEY_FILE` (ou une clé hexadécimale de 64 caractères dans `EASYWINE_BACKUP_KEY`, **jamais les deux**). Puis :

    npm run backup -- backup-encrypted --directory /volume/backup-easywine

Restaurer uniquement vers un nouveau fichier, après récupération de la clé :

    npm run backup -- restore-encrypted --from /volume/backup-easywine/easywine-ARCHIVE.ewb --to /volume/recovery/new.sqlite

La commande refuse les clés incorrectes, les archives modifiées et les destinations existantes. Le nouveau fichier n'est jamais publié avant la vérification SQLite. Pour la bascule, arrêter le service, pointer `EASYWINE_DB` vers cette nouvelle base puis redémarrer ; conserver l'ancienne intacte en cas de rollback.

**Limites d'exploitation :** SQLite produit temporairement une copie non chiffrée dans un répertoire privé du disque temporaire pendant les opérations de sauvegarde/restauration, effacée en cas de sortie normale mais potentiellement récupérable après crash. Choisir un système de fichiers temporaire protégé/chiffré ou un disque chiffré. Les sauvegardes ne sont pas encore planifiées ni externalisées automatiquement ; configurer le planificateur du serveur et la copie hors site avec les accès minimums, la rétention, les alertes et des exercices périodiques de restauration. Une perte de clé rend les archives chiffrées irrécupérables.

## Gestion des stocks

Depuis **Ma cave → Mouvements**, chaque entrée/sortie impose une variation entière, un motif et une justification. Le serveur empêche le stock négatif, les conflits de modification et la répétition d'un mouvement déjà confirmé (clé d'idempotence). Les importations CSV et le stock initial créent aussi des lignes de traçabilité. Lors de la migration des anciennes bases (v2 → v3), chaque vin reçoit une ligne `baseline` indiquant que les mouvements antérieurs sont inconnus, et **pas** une vente fictive.

Le clic « Le client a choisi ce vin » **ne modifie pas le stock** : c'est un choix de service, pas une confirmation de vente POS. Les stocks doivent être ajustés explicitement ou, plus tard, via un connecteur caisse validé.

## Sauvegardes, restauration et conservation

Créer une sauvegarde cohérente et vérifiée de SQLite, y compris en mode WAL :

    npm run backup -- backup --directory /chemin/prive/aux/sauvegardes

Restaurer **vers un nouveau fichier**, sans écraser la base en cours d'utilisation :

    npm run backup -- restore --from /chemin/prive/aux/sauvegardes/snapshot.sqlite --to /chemin/prive/base-restauree.sqlite

Sous PowerShell, placez les chemins entre guillemets, par exemple `npm run backup -- backup --directory "C:\\EasyWine\\backups"`. Pour basculer : arrêter le service, modifier `EASYWINE_DB` pour pointer vers la nouvelle base puis redémarrer. Conserver l'ancienne base intacte pour le rollback. Les sauvegardes doivent être conservées hors du serveur, protégées et restaurées lors d'exercices réguliers. La commande ne remplace pas une vraie politique de sauvegarde externalisée.

La base est migrée transactionnellement de v1 à v2 puis de v2 à v3 au démarrage. Les versions inconnues provoquent un refus de démarrage (pas de migration destructive implicite).

Purger l'historique de service au-delà d'une durée définie par la politique de conservation du restaurant (exemple 180 jours) :

    npm run backup -- prune-service-history --days 180

Cette purge ne supprime pas les anciennes sauvegardes : gérer séparément leur durée de conservation.

## Tests

    npm test
    npm run check

Les tests couvrent également les imports de cave et les contraintes du moteur et des parcours HTTP : isolation des restaurants, authentification, accès, stocks, accord classique, audit, concurrence optimiste et contrôle anti-CSRF. La CI vérifie la syntaxe, les tests serveur et un parcours Chrome réel sur desktop/mobile. Playwright n'est installé **qu'en CI**, pas dans l'application déployée.

## Garanties et limites actuelles

- **Garanti par le code :** seuls les vins actifs avec stock positif entrent dans la sélection. Un accord classique épuisé reste mémorisé et est signalé. Chaque mutation importante est journalisée. Les requêtes sont limitées au restaurant de la session.
- **À valider avec des professionnels du vin :** calibration des coefficients d'accord. Le score est heuristique, pas une mesure scientifique de qualité gastronomique.
- **Non réalisé dans cette version :** import Excel natif (.xlsx), POS/Trivec, gestion des réservations, intégration automatique aux ventes POS, analytics avancées, véritable fonctionnement hors connexion au serveur, gestion de plusieurs établissements par un même compte et reprise automatique après sinistre.
- **Usage hors Internet :** un serveur EasyWine accessible sur le réseau local peut continuer à fonctionner sans Internet ; l'application ne fonctionne pas lorsque sa propre API est inaccessible. Ce n'est **pas** une PWA hors-ligne autonome.
- **Données statistiques :** une recommandation affichée n'est pas une vente. Le serveur enregistre la liste des vins présentés et uniquement les choix que le personnel confirme ; il ne décrémente **jamais automatiquement** le stock.
- **Architecture :** mono-instance SQLite. Passer à PostgreSQL et aux contrôles de tenant côté base pour un SaaS distribué et des opérations multi-processus.
- **Conformité :** cette version ne constitue pas une validation RGPD/CNIL. Les comptes et les événements de service peuvent identifier des salariés. Avant exploitation publique : information, base légale, gestion des droits, durées de conservation, contrat de sous-traitance si applicable, durcissement réseau, surveillance, gestion opérationnelle des sauvegardes chiffrées, MFA/SSO et procédure de récupération d'un compte propriétaire.

## Structure

- src/core/pairing.js — moteur métier pur
- src/server — routes, auth, stockage et validation
- public — application web tactile, modules JavaScript et style
- tests — moteur et intégration HTTP
- src/server/migrations — évolutions atomiques du schéma SQLite
- src/server/maintenance* et encrypted-backup.js — sauvegarde, chiffrement, restauration et conservation
- src/server/stock-ledger.js — historique des mouvements de stock et idempotence

Les contributions arrivent sur branche et pull request. main reste la référence stable.

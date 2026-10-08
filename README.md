# EasyWine — accords mets & vins, sans dépendance à l'IA

EasyWine aide le personnel de salle à recommander rapidement des bouteilles **réellement présentes dans la cave de son restaurant**. L'accord classique reste sous le contrôle du restaurateur. Les recommandations sont explicables, filtrées par les préférences et le stock, et le prix n'entre jamais dans le calcul de compatibilité.

## État de cette version

- Interface tactile en français : plat → envies → couleur → budget (facultatif) → recommandations et phrase à dire.
- Gestion des vins, du stock, des plats, des accords classiques, des comptes et de l'historique.
- Import de cave CSV avec aperçu, validation stricte, refus des doublons et transaction atomique (500 références par lot maximum).
- Authentification par session HTTP-only, rôles owner / manager / staff, vérifications serveur tenant par tenant.
- Base SQLite transactionnelle avec WAL, migrations versionnées, sauvegardes vérifiées, contrôle de version optimiste et journal d'audit.
- Révocation immédiate des comptes, changement de mot de passe et invalidation des sessions.
- Second facteur facultatif TOTP pour chaque utilisateur : défi à la connexion, codes de récupération à usage unique et secret chiffré avec clé indépendante.
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

Pour conserver automatiquement une **seconde copie authentifiée**, ajouter un répertoire secondaire accessible au compte technique :

    npm run backup -- backup-encrypted --directory /volume/backup-easywine --replica-dir /montage/seconde-destination/easywine

La copie est écrite dans un fichier temporaire privé, vérifiée par empreinte SHA-256 complète puis publiée sans écraser un fichier existant. Une erreur de copie rend la commande non réussie et préserve la sauvegarde principale. **Le second répertoire n'est pas automatiquement « hors site »** : il doit être monté sur un véritable stockage distinct avec droits minimum, disponibilité surveillée, rétention explicite et essais de restauration. Un simple autre dossier du même disque ne protège pas d'une panne du support. Aucune tâche planifiée ou réplication cloud n'est automatiquement installée sur votre machine.

Restaurer uniquement vers un nouveau fichier, après récupération de la clé :

    npm run backup -- restore-encrypted --from /volume/backup-easywine/easywine-ARCHIVE.ewb --to /volume/recovery/new.sqlite

La commande refuse les clés incorrectes, les archives modifiées et les destinations existantes. Le nouveau fichier n'est jamais publié avant la vérification SQLite. Pour la bascule, arrêter le service, pointer `EASYWINE_DB` vers cette nouvelle base puis redémarrer ; conserver l'ancienne intacte en cas de rollback.

**Limites d'exploitation :** SQLite produit temporairement une copie non chiffrée dans un répertoire privé du disque temporaire pendant les opérations de sauvegarde/restauration, effacée en cas de sortie normale mais potentiellement récupérable après crash. Choisir un système de fichiers temporaire protégé/chiffré ou un disque chiffré. Les sauvegardes ne sont pas encore planifiées ni externalisées automatiquement ; configurer le planificateur du serveur et la copie hors site avec les accès minimums, la rétention, les alertes et des exercices périodiques de restauration. Une perte de clé rend les archives chiffrées irrécupérables.


## Double authentification TOTP (facultative)

Le second facteur est une option de sécurité par utilisateur, distincte des sessions. Lorsqu'il est activé, un mot de passe correct déclenche un défi de 5 minutes mais **ne délivre aucun cookie de session**. Le serveur exige un code TOTP (RFC 6238, 6 chiffres, fenêtres ±30 s, anti-rejeu) ou un code de secours à usage unique. Les tentatives MFA sont limitées et un verrouillage temporaire est conservé dans SQLite. Modifier un mot de passe révoque aussi les défis non terminés.

Avant d'activer la fonction, générer une **autre** clé aléatoire de 32 octets, distincte de la clé des sauvegardes. La conserver hors Git et sauvegarder séparément son accès :

    node -e "const fs=require('node:fs'),c=require('node:crypto');fs.writeFileSync(process.argv[1],c.randomBytes(32).toString('hex')+'\\n',{flag:'wx',mode:0o600})" /dossier-prive/easywine-mfa.key

Configurer `EASYWINE_MFA_KEY_FILE` (ou `EASYWINE_MFA_KEY`, **jamais les deux**), puis redémarrer le processus EasyWine. Au démarrage, l'application vérifie réellement le déchiffrement de **tous les comptes ayant le MFA actif** ; une clé absente, mauvaise ou une donnée chiffrée corrompue empêche volontairement le démarrage, sans contournement par mot de passe seul. Sans clé configurée et sans compte MFA actif, le service démarre mais masque le formulaire d'activation. Sur Unix, la clé doit rester lisible uniquement par le compte de service. Sur Windows, vérifier les ACL NTFS. Le secret TOTP individuel est chiffré en AES-256-GCM et lié à l'identifiant de l'utilisateur. La clé de chiffrement **n'est jamais enregistrée dans la BDD**.

Depuis **Mon compte**, confirmer son mot de passe puis inscrire la clé dans une application d'authentification TOTP. Le code TOTP utilisé pour valider l'activation est immédiatement consommé et ne peut pas être réutilisé pour se connecter. Un test confirme l'activation et le serveur remet **huit codes de récupération** affichés une seule fois. Les codes ne sont conservés en BDD que sous forme de condensats. Une activation ou désactivation réussie révoque toutes les sessions concernées.

**Points de vigilance :** si la clé MFA de l'installation est perdue, les facteurs enregistrés ne peuvent plus être déchiffrés. En cas de perte de l'appareil, utiliser un code de secours inutilisé. Aucun renouvellement autonome des codes de secours n'est encore implémenté : pour en recevoir de nouveaux, il faut désactiver puis réactiver le MFA en possédant encore le mot de passe et un facteur utilisable. La récupération administrative d'urgence doit être maîtrisée avant toute exploitation publique. TOTP reste sensible au phishing ; WebAuthn/passkeys ou SSO peuvent renforcer ce modèle dans une évolution contrôlée. **Ne jamais désactiver le MFA automatiquement quand le réseau ou le service MFA est indisponible.**

## Gestion des stocks

Depuis **Ma cave → Mouvements**, chaque entrée/sortie impose une variation entière, un motif et une justification. Le serveur empêche le stock négatif, les conflits de modification et la répétition d'un mouvement déjà confirmé (clé d'idempotence). Les importations CSV et le stock initial créent aussi des lignes de traçabilité. Lors de la migration des anciennes bases (v2 → v3), chaque vin reçoit une ligne `baseline` indiquant que les mouvements antérieurs sont inconnus, et **pas** une vente fictive.

Le clic « Le client a choisi ce vin » **ne modifie pas le stock** : c'est un choix de service, pas une confirmation de vente POS. Les stocks doivent être ajustés explicitement ou, plus tard, via un connecteur caisse validé.

## Sauvegardes, restauration et conservation

Créer une sauvegarde cohérente et vérifiée de SQLite, y compris en mode WAL :

    npm run backup -- backup --directory /chemin/prive/aux/sauvegardes

Restaurer **vers un nouveau fichier**, sans écraser la base en cours d'utilisation :

    npm run backup -- restore --from /chemin/prive/aux/sauvegardes/snapshot.sqlite --to /chemin/prive/base-restauree.sqlite

Sous PowerShell, placez les chemins entre guillemets, par exemple `npm run backup -- backup --directory "C:\\EasyWine\\backups"`. Pour basculer : arrêter le service, modifier `EASYWINE_DB` pour pointer vers la nouvelle base puis redémarrer. Conserver l'ancienne base intacte pour le rollback. Les sauvegardes doivent être conservées hors du serveur, protégées et restaurées lors d'exercices réguliers. La commande ne remplace pas une vraie politique de sauvegarde externalisée.

**Avant toute montée de version sur une base réelle**, générer et tester une sauvegarde chiffrée et vérifier la disponibilité de la clé correspondante. La base est migrée transactionnellement de v1 à v2, de v2 à v3 puis de v3 à v4 au démarrage. Une archive SQLite historique v1, v2 ou v3 peut être restaurée dans un **nouveau** fichier, puis migrée par EasyWine au démarrage ; aucun fichier source n'est réécrit. Les formats inconnus sont refusés. La vérification de sauvegarde v3 contrôle aussi la continuité du journal de stock avec la quantité courante. Les versions inconnues provoquent un refus de démarrage (pas de migration destructive implicite).

Purger l'historique de service au-delà d'une durée définie par la politique de conservation du restaurant (exemple 180 jours) :

    npm run backup -- prune-service-history --days 180

Cette purge ne supprime pas les anciennes sauvegardes : gérer séparément leur durée de conservation.

## Validation sur la sandbox Windows SPOOKY

EasyWine possède un profil déclaré dans `.sandbox/profile.json`, consommé par l'agent de `SPOOKYDEV-AI/spooky-sandbox-control-plane`. Il demande Node.js 22.16+, vérifie les principaux modules JavaScript, exécute tous les tests Node et ouvre le véritable serveur EasyWine sur un port local dynamique pour un audit Playwright **sans données de production** (390×844, 768×1024, 1440×900). Pour l'audit visuel, `scripts/sandbox-audit-server.js` impose une **base SQLite en mémoire** et une écoute localhost, même si une variable `EASYWINE_DB` existe sur la machine. Le script refuse de se lancer hors d'un job marqué `SPOOKY_SANDBOX=1`. Le worktree de test est indépendant et nettoyé par l'agent après exécution. L'audit visuel générique vérifie la page de connexion ; les tests Chrome applicatifs de connexion/MFA restent également exécutés par GitHub Actions.

L'agent local doit autoriser explicitement ce dépôt : depuis le PC sandbox, utiliser `C:\\SPOOKY_SANDBOX\\SANDBOX-ALLOW-REPO.cmd SPOOKYDEV-AI/easywine`. Ne pas contourner la liste `allowedRepos` via un dépôt déjà autorisé.

Envoyer ensuite **dans le dépôt de contrôle privé**, et non dans EasyWine, une issue `sandbox-job` avec le corps JSON :

```json
{
  "repo": "SPOOKYDEV-AI/easywine",
  "ref": "main",
  "runner": "auto",
  "task": "audit",
  "publish": true
}
```

L'agent répond sur l'issue, écrit les résultats synthétiques dans la branche `sandbox-results` du dépôt privé, et place les journaux/captures dans une Release privée temporaire. Préférer un commit SHA figé pour une certification reproductible. N'utiliser que des branches **revues et dignes de confiance** : les tests exécutent réellement du code sur le PC Windows. Ne jamais inclure de secrets ou données de patients/clients dans l'issue ou dans les captures publiées. Pour des données sensibles, utiliser `"publish": false` et inspecter localement les artefacts.

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
- **Conformité :** cette version ne constitue pas une validation RGPD/CNIL. Les comptes et les événements de service peuvent identifier des salariés. Avant exploitation publique : information, base légale, gestion des droits, durées de conservation, contrat de sous-traitance si applicable, durcissement réseau, surveillance, gestion opérationnelle des sauvegardes chiffrées, déploiement effectif du MFA et procédure de récupération d'un compte propriétaire.

## Structure

- src/core/pairing.js — moteur métier pur
- src/server — routes, auth, stockage et validation
- public — application web tactile, modules JavaScript et style
- tests — moteur et intégration HTTP
- src/server/migrations — évolutions atomiques du schéma SQLite
- src/server/maintenance* et encrypted-backup.js — sauvegarde, chiffrement, restauration et conservation
- src/server/stock-ledger.js — historique des mouvements de stock et idempotence
- src/server/mfa*.js, secret-key.js — second facteur, défi, cryptographie et récupération
- public/account.js — gestion de compte et second facteur

Les contributions arrivent sur branche et pull request. main reste la référence stable.

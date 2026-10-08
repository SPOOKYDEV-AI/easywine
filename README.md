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

## Sauvegardes, restauration et conservation

Créer une sauvegarde cohérente et vérifiée de SQLite, y compris en mode WAL :

    npm run backup -- backup --directory /chemin/prive/aux/sauvegardes

Restaurer **vers un nouveau fichier**, sans écraser la base en cours d'utilisation :

    npm run backup -- restore --from /chemin/prive/aux/sauvegardes/snapshot.sqlite --to /chemin/prive/base-restauree.sqlite

Sous PowerShell, placez les chemins entre guillemets, par exemple `npm run backup -- backup --directory "C:\\EasyWine\\backups"`. Pour basculer : arrêter le service, modifier `EASYWINE_DB` pour pointer vers la nouvelle base puis redémarrer. Conserver l'ancienne base intacte pour le rollback. Les sauvegardes doivent être conservées hors du serveur, protégées et restaurées lors d'exercices réguliers. La commande ne remplace pas une vraie politique de sauvegarde externalisée.

La base est migrée transactionnellement de v1 à v2 au démarrage. Les versions inconnues provoquent un refus de démarrage (pas de migration destructive implicite).

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
- **Conformité :** cette version ne constitue pas une validation RGPD/CNIL. Les comptes et les événements de service peuvent identifier des salariés. Avant exploitation publique : information, base légale, gestion des droits, durées de conservation, contrat de sous-traitance si applicable, durcissement réseau, surveillance, chiffrement des sauvegardes, MFA/SSO et procédure de récupération d'un compte propriétaire.

## Structure

- src/core/pairing.js — moteur métier pur
- src/server — routes, auth, stockage et validation
- public — application web tactile, modules JavaScript et style
- tests — moteur et intégration HTTP
- src/server/migrations — évolutions atomiques du schéma SQLite
- src/server/maintenance* — sauvegarde, restauration et conservation

Les contributions arrivent sur branche et pull request. main reste la référence stable.

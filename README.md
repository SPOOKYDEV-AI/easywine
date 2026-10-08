# EasyWine — accords mets & vins, sans dépendance à l'IA

EasyWine aide le personnel de salle à recommander rapidement des bouteilles **réellement présentes dans la cave de son restaurant**. L'accord classique reste sous le contrôle du restaurateur. Les recommandations sont explicables, filtrées par les préférences et le stock, et le prix n'entre jamais dans le calcul de compatibilité.

## État de cette version

- Interface tactile en français : plat → envies → couleur → budget (facultatif) → recommandations et phrase à dire.
- Gestion des vins, du stock, des plats, des accords classiques, des comptes et de l'historique.
- Authentification par session HTTP-only, rôles owner / manager / staff, vérifications serveur tenant par tenant.
- Base SQLite transactionnelle avec WAL, contrôle de version optimiste et journal d'audit.
- Algorithme déterministe, sans API payante et sans promesse de sommellerie automatisée.

## Pré-requis

Node.js **22.13 ou supérieur** (ou une branche LTS suivante avec node:sqlite), navigateur moderne. Aucune dépendance npm externe, aucun conteneur requis.

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

**Production :** placer le processus derrière un proxy HTTPS correctement configuré, avec stockage persistant privé et sauvegardes cohérentes (API de sauvegarde SQLite / VACUUM INTO). Le mode production active le cookie Secure. Ne pas exposer directement le port HTTP sur Internet.

## Tests

    npm test
    npm run check

Les tests couvrent les contraintes du moteur et des parcours HTTP : isolation des restaurants, authentification, accès, stocks, accord classique, audit, concurrence optimiste et contrôle anti-CSRF. La CI est volontairement limitée aux PR, sans installation de dépendances.

## Garanties et limites actuelles

- **Garanti par le code :** seuls les vins actifs avec stock positif entrent dans la sélection. Un accord classique épuisé reste mémorisé et est signalé. Chaque mutation importante est journalisée. Les requêtes sont limitées au restaurant de la session.
- **À valider avec des professionnels du vin :** calibration des coefficients d'accord. Le score est heuristique, pas une mesure scientifique de qualité gastronomique.
- **Non réalisé dans cette version :** import CSV/Excel, POS/Trivec, gestion des réservations, choix effectif du client et analytics avancées, véritable fonctionnement hors connexion au serveur, gestion de plusieurs établissements par un même compte et reprise automatique après sinistre.
- **Architecture :** mono-instance SQLite. Passer à PostgreSQL et aux contrôles de tenant côté base pour un SaaS distribué et des opérations multi-processus.
- **Conformité :** cette version ne constitue pas une validation RGPD/CNIL. Prévoir avant exploitation publique une politique de conservation, droits des personnes, information, durcissement déploiement, revue de sécurité et procédures de sauvegarde/restauration.

## Structure

- src/core/pairing.js — moteur métier pur
- src/server — routes, auth, stockage et validation
- public — application web tactile, modules JavaScript et style
- tests — moteur et intégration HTTP

Les contributions arrivent sur branche et pull request. main reste la référence stable.

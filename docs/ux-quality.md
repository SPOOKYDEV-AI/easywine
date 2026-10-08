
# EasyWine — protocole UX, qualité et performance

Édition 1 · Octobre 2026 · **Référentiel mesurable, pas certification universelle**.

## Objectif produit

Servir une proposition de vin **effectivement présente en cave**, avec une explication intelligible, sans API IA, avec peu de gestes et sans confusion entre une recommandation, le choix déclaré d'un client et une vente POS.

## Parcours utilisateur de référence

| Rôle | Objectif | Parcours | Scénario de reprise |
| --- | --- | --- | --- |
| Personnel de salle | Conseiller en service | Connexion → MFA si actif → plat → préférences facultatives → suggestions en stock → explication → choix du client | Réseau lent : indicateur contextuel ; réseau coupé : erreur lisible, pas de proposition périmée |
| Responsable | Tenir la cave exacte | Connexion → Ma cave → recherche → mouvement avec motif/justification → vérification de la quantité | Version stock modifiée par un collègue : conflit explicite ; ne jamais supposer une vente |
| Responsable | Initialiser le restaurant | Ma carte → créer plat ; cave → import CSV prévisualisé → accord classique → exclusions → collaborateurs | Erreur de validation : formulaire et saisie conservés |
| Propriétaire | Gérer l'équipe | Mon équipe → activation/désactivation → permissions et comptes, Mon compte → MFA | Révocation des sessions ; clé MFA manquante = refus de démarrage, pas de fallback |
| Responsable | Comprendre l'activité | Statistiques → affichages → choix déclarés | Sans événements : état vide, pas de statistiques fictives |

Un choix déclaré n'est **jamais** une vente encaissée. Les décisions de stock et les statistiques doivent conserver cette distinction.

## Architecture de navigation adaptative

- **Desktop / tablette large** : navigation latérale persistante, accessible au clavier et sans disparition lors des changements de rubrique.
- **Téléphone (≤680 px)** : navigation **fixe en bas d'écran** vers Conseiller, Cave, Carte et Compte ; les rubriques secondaires sont sous « Plus » avec fermeture Échap, retour du focus sur la commande et état `aria-expanded`.
- **Personnel de salle** : seulement Conseiller et Compte ; aucun onglet de gestion affiché, indépendamment des permissions API.
- Une navigation changeant de rubrique repositionne le document en haut, sans perdre le contexte des préférences de service ni déplacer arbitrairement une vue rafraîchie.
- Les commandes tactiles doivent rester utilisables avec une seule main ; au plus cinq destinations principales. Fondements : [Android Material navigation](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns) et [Apple HIG tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars). Ce choix est une hypothèse ergonomique à confronter aux vrais utilisateurs, pas une validation de leur comportement.
- Les captures `mobile-navigation.png` et le scénario `tests/browser-mobile-nav.mjs` vérifient la taille physique des cibles, la visibilité du menu, les permissions et le repositionnement après scroll.

## Comportements attendus dans chaque état

- **Premier chargement** : logo lisible et statut annoncé aux lecteurs d'écran, plutôt qu'une interface blanche avant la résolution de session.
- **Chargement de code** : script de connexion minimal ; cave, carte, historique, paramètres et statistiques chargés à la première ouverture, puis conservés par module pour les visites suivantes.
- **Navigation** : état d'attente pour les rubriques dépendantes du réseau ; une réponse arrivée après un changement de rubrique n'est plus appliquée à la page active.
- **Réseau défaillant** : message persistant + bouton Réessayer pour la rubrique ; aucune redirection automatique vers la connexion si la panne est réseau.
- **Envoi de formulaire** : bouton désactivé et libellé explicite pendant le traitement ; les valeurs restent présentes après un échec. Pendant un enregistrement, ne pas permettre la fermeture involontaire de la modale.
- **Stock** : protection idempotente pour les mouvements et refus des quantités négatives, mais **ne pas** supposer que tous les autres POST sont rejouables sans risque.
- **Fichiers publics** : empreintes SHA-256 ETag calculées au démarrage, validation conditionnelle 304 ; aucune donnée métier ou privée en cache navigateur (API no-store).
- **Catalogues volumineux** : recherche sur toutes les références, rendu initial limité à 80 et chargement manuel des suivantes pour limiter les nœuds DOM.
- **Session** : purge des données en mémoire à la déconnexion ; connexion protégée si MFA actif.
- **Mouvement réduit** : aucune animation obligatoire pour lire ou activer l'interface ; si `prefers-reduced-motion:reduce`, supprimer les animations non essentielles.

## Mesures et protocoles

### Tests automatisés

1. `npm test` : authentification, sécurité, schéma, stocks, sauvegardes et migrations.
2. `tests/browser-smoke.mjs` : connexion, cave, plats, import, mouvement, conseil, choix, statistiques et téléphone.
3. `tests/browser-mfa.mjs` : enrôlement TOTP, codes de secours, connexion en deux étapes, téléphone.
4. `tests/browser-ux.mjs` : chargement initial retardé, bouton de connexion pendant latence, ordre des réponses lors de navigation rapide, défaillance réseau + reprise, délai des recommandations, réduction des animations, overflow mobile. Il produit `test-artifacts/ux-lab-metrics.json` et inscrit `BROWSER_UX_OK` dans les logs CI.
5. `tests/browser-ux.mjs` couvre également la fermeture `Escape` pendant une sauvegarde en cours, le focus clavier initial des formulaires et l'absence de double requête de modification.
6. `tests/browser-scale.mjs` : génération synthétique de 2 400 vins, mesure de la connexion avec chargement de cave, rendu initial limité à 80 lignes, expansion à 160, recherche sur les 2 400, contrôle DOM/overflow mobile. Produit `ux-scale.json`, sans donnée restaurant réelle.
7. `tests/browser-mobile-nav.mjs` : test réel du menu mobile, des rôles, du panneau Plus, du clavier Échap, du retour du focus et des cibles tactiles.
8. `SPOOKY Sandbox` : profil `.sandbox/profile.json`, Windows réel, trois tailles d'écran (390×844, 768×1024, 1440×900), HTTP, erreurs navigateur et débordements, sans données de clients ni dossier local d'exploitation.

### Indicateurs

- **LCP** (chargement principal), **CLS** (stabilité), **INP** (réactivité réelle) : objectifs de référence **LCP ≤ 2 500 ms**, **CLS ≤ 0,1**, **INP ≤ 200 ms** au 75e percentile **de sessions terrain**, segmentées mobile/desktop, selon web.dev :
  https://web.dev/articles/vitals/
- **Temps de navigation en laboratoire** : délai d'un clic de rubrique jusqu'à l'élément opérationnel. Le test enregistre les millisecondes, sans prétendre être une mesure de terrain.
- **État de service** : délai entre validation du filtre et affichage d'un résultat ; tester avec réseau latent et retours 4xx/5xx.
- **Résilience** : pas de spinner permanent, aucun double envoi accidentel, aucun rendu de résultats périmés.
- **Accessibilité** : vérifier WCAG 2.2 AA, notamment **4.1.3 messages de statut**, **2.4.11 focus non masqué**, **2.5.8 cible d'au moins 24×24 CSS px ou exception d'espacement**. EasyWine vise ≥44 px sur ses contrôles principaux (plus confortable que le minimum) :
  https://www.w3.org/TR/WCAG22/

### Interprétation honnête

Un score LCP/CLS obtenu en Chrome CI sur un serveur loopback et des données de démonstration n'est **pas** un résultat garanti sur le réseau 3G/4G/Wi-Fi du restaurant. Une valeur INP au 75e percentile nécessite des sessions réelles, suffisamment nombreuses, instrumentées avec consentement, politique de conservation et contrôle d'accès appropriés. Les tests de laboratoire servent à détecter des régressions, pas à annoncer une conformité globale.

## Détail des tests de résistance à compléter

- [ ] Vérification manuelle clavier complet / lecteur d'écran / contrastes / zoom 200–400 %.
- [ ] Base réaliste de 2 000–10 000 références, grande carte et multi-utilisateurs en parallèle.
- [ ] Parcours hors connexion réelle / reconnexion de la caisse / latence variable et paquets perdus.
- [ ] Authentification MFA et récupération du propriétaire dans un environnement pré-production.
- [ ] Comparaison des performances p75 sur appareils Android et iOS réels, après cadrage RGPD.
- [ ] Tests sommelier et personnel de salle : taux de succès des suggestions sur références réelles, compréhension et temps de conseil.
- [ ] Plan de déploiement HTTPS, sauvegardes planifiées hors site, supervision, restauration et journal d'incident.

Ne pas cocher ces activités sans procès-verbal ou résultat vérifiable. La réussite du parcours Playwright ne suffit pas à elle seule à certifier accessibilité et ergonomie.

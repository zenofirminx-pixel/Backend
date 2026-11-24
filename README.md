# Pal Backend

Backend Node.js + Express pour le réseau social Pal, avec Firestore via Firebase Admin SDK, compatible Vercel. L'authentification et les sessions sont gérées côté serveur (pas Firebase Auth).

## Sécurité et sessions
- Inscription et connexion via l'API, mots de passe Argon2id.
- Sessions aléatoires opaques, hash SHA-256 stocké dans `authSessions`, cookie HttpOnly `pal_session`.
- Cookie CSRF `pal_csrf`, jeton envoyé dans `X-CSRF-Token` pour les mutations.
- CORS limité aux origines configurées; limitation de débit.
- E-mails de vérification et réinitialisation à usage unique; 2FA TOTP chiffrée AES-256-GCM.
- Les règles Firestore/Storage interdisent l'accès direct client; le backend Admin est le seul accès.

## Routes

### État
| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | Non | Santé API |
| GET | `/api/auth/csrf` | Non | Initialise le cookie CSRF et retourne le jeton |

### Authentification (`/api/auth`)
| Méthode | Route | Description |
|---|---|---|
| POST | `/register` | Création de compte (firstName, lastName, birthDate, gender, email, password; username facultatif) |
| POST | `/login` | Connexion; peut demander une vérification 2FA |
| POST | `/2fa/login` | Valide le code du challenge 2FA |
| POST | `/logout` | Déconnexion et révocation de session |
| GET | `/me` | Compte de la session |
| GET | `/verify-email?token=...` | Vérification email |
| POST | `/resend-verification` | Renvoi email de vérification |
| POST | `/forgot-password` | Demande de réinitialisation |
| POST | `/reset-password` | Réinitialisation par jeton |
| POST | `/change-password` | Changement de mot de passe de session |
| POST | `/2fa/setup`, `/2fa/confirm`, `/2fa/disable`, `/2fa/recovery-codes/regenerate` | Gestion 2FA |

### Profils (`/api/profile`, session requise)
| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Lire son profil |
| PATCH | `/` | Mettre à jour prénom, nom, date de naissance, genre, username |
| POST | `/avatar` | Avatar WebP (120 Ko maximum) |

### Réseau social (`/api/social`, session requise)
| Méthode | Route | CSRF | Description |
|---|---|---|---|
| GET | `/feed` | Non | Fil paginé, compte likes/commentaires et like de l'utilisateur |
| POST | `/posts` | Oui | Créer un post texte et/ou image |
| DELETE | `/posts/:postId` | Oui | Supprimer son post |
| POST | `/posts/:postId/like` | Oui | Basculer like/unlike |
| GET | `/posts/:postId/comments` | Non | Liste commentaires |
| POST | `/posts/:postId/comments` | Oui | Ajouter commentaire |
| GET | `/users/search?q=` | Non | Recherche par prénom, nom ou username |
| GET | `/users/:uid` | Non | Profil public et 20 posts récents |
| GET | `/friends` | Non | Liste d'amis |
| GET | `/friends/requests` | Non | Demandes reçues |
| POST | `/friends/:uid/request` | Oui | Envoyer demande d'amitié |
| POST | `/friends/:uid/accept` | Oui | Accepter demande reçue |
| POST | `/friends/:uid/decline` | Oui | Refuser demande reçue |
| DELETE | `/friends/:uid` | Oui | Retirer un ami |
| POST | `/users/:uid/block` | Oui | Bloquer un compte et retirer la relation/demande existante |
| DELETE | `/users/:uid/block` | Oui | Débloquer un compte |
| GET | `/blocks` | Non | Liste des comptes bloqués |
| POST | `/reports` | Oui | Déposer un signalement (user/post/comment/message) |
| GET | `/conversations` | Non | Liste des conversations |
| GET | `/messages/:uid` | Non | Messages d'un ami |
| POST | `/messages/:uid` | Oui | Envoyer un message à un ami |
| GET | `/notifications` | Non | Notifications |
| PATCH | `/notifications/:notificationId/read` | Oui | Marquer notification lue |

Les mutations exigent `X-CSRF-Token` égal au cookie `pal_csrf`. L'APK doit conserver les cookies reçus, récupérer le jeton CSRF avant les mutations et inclure les cookies avec les requêtes.

## Images
Les photos de publications sont conservées dans Firestore sous forme de data URI Base64, conformément à l'approche retenue pour Pal. JPEG, PNG et WebP sont acceptés. La taille binaire maximale d'une image de post est 450 Ko; la limite JSON de l'API est 700 Ko. Il faut compresser/redimensionner les images côté APK. Firestore limite les documents à 1 Mio, donc ce stockage Base64 doit rester petit et les posts ne doivent pas contenir d'images brutes trop lourdes. Les avatars WebP sont limités à 120 Ko.

## Collections Firestore utilisées
- `users/{uid}` : profil, hash de mot de passe, paramètres de compte.
- `authEmailIndex/{hash}` : index email unique.
- `authUsernameIndex/{username}` : index username unique.
- `userSearch/{uid}` : champs de recherche normalisés.
- `authSessions/{hash}` et `authActionTokens/{hash}` : sessions et jetons temporaires.
- `posts/{postId}` et sous-collections `likes/{uid}`, `comments/{commentId}`.
- `friendRequests/{pairId}`, `friendships/{pairId}`.
- `conversations/{pairId}/messages/{messageId}`.
- `users/{uid}/notifications/{notificationId}`.
- `users/{uid}/assistantConversations/main/messages/{id}` : historique Pal AI isolé par utilisateur.

## Index de recherche pour comptes existants
La recherche utilise `userSearch`. Les nouveaux comptes et les profils modifiés alimentent cette collection. Pour les comptes créés avant cette version, lancer une fois la migration après avoir configuré les variables Firebase :
```bash
npm run migrate:social-index
```
La migration ne change pas les comptes; elle crée les documents de recherche manquants.

## Configuration
Copier `.env.example` vers `.env` localement ou renseigner les variables dans le déploiement. Variables principales :
- `FIREBASE_SERVICE_ACCOUNT_BASE64` (secret Admin encodé Base64) ou `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
- `FIREBASE_STORAGE_BUCKET` si nécessaire pour le service existant.
- `CORS_ORIGINS`, `FRONTEND_URL`, `PUBLIC_API_URL`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`.
- `OPENAI_API_KEY`, `OPENAI_MODEL` (facultatifs pour Pal AI).
- `TOTP_ENCRYPTION_KEY` : 64 caractères hexadécimaux (32 octets).

Ne jamais commit les secrets. Configurer les règles Firestore/Storage du dépôt. Les routes sociales sont développées côté backend, mais elles ne sont pas encore intégrées ni vérifiées depuis l'APK.

## Installation / tests
Node.js 22+:
```bash
npm install
npm run check
npm test
npm run dev
```

Les tests smoke vérifient la santé, les refus de session et le CSRF. Les parcours nécessitant Firestore, SMTP ou OpenAI doivent être testés avec leurs variables de configuration.

## Déploiement Vercel
Importer le dépôt, preset `Other`, garder la racine du projet, configurer les variables d'environnement et déployer. `api/index.js` exporte Express. Vérifier `/api/health`.

## Limites avant production
- Tester réellement les emails, inscription, sessions et 2FA.
- Rate limiter en mémoire : prévoir Redis/Upstash pour déploiement multi-instances.
- Ajouter les index Firestore indiqués dans `firestore.indexes.json` si Firebase les demande.
- La suppression de compte, la modération humaine/admin, les outils de traitement des signalements et les règles de visibilité avancées ne sont pas encore implémentés. Les endpoints de blocage et de signalement existent, mais le signalement ne déclenche pas encore de traitement automatique.
- Messages et posts images ne sont pas chiffrés de bout en bout.
- Le client Android doit intégrer les appels API et les états de chargement/erreur.

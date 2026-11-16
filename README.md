
# OpenDC Backend — authentification serveur

API Node.js + Express, Firestore via Firebase Admin SDK, déployable sur Vercel. Firebase Authentication n'est pas utilisé.

## Authentification

- Inscriptions et connexions gérées exclusivement par l'API.
- Mots de passe hachés avec Argon2id ; aucun mot de passe brut n'est conservé.
- Sessions opaques aléatoires, seul leur SHA-256 est stocké dans `authSessions`.
- Cookie de session `HttpOnly`, `SameSite=Strict`, `Secure` en production.
- Jeton CSRF synchronisé dans un cookie dédié et envoyé dans `X-CSRF-Token`.
- Origines CORS autorisées explicitement, avec `credentials: true`.
- Index e-mail séparé et transactionnel (`authEmailIndex`) pour empêcher les doublons.
- Vérification d'adresse e-mail et réinitialisation via liens à durée limitée, à usage unique.
- Limitation de débit globale et sur les routes sensibles.

## Routes

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/health` | État de l'API |
| GET | `/api/auth/csrf` | Initialise le cookie CSRF et renvoie le jeton |
| POST | `/api/auth/register` | Crée un compte et envoie le lien de vérification |
| POST | `/api/auth/login` | Vérifie Argon2id et ouvre une session |
| POST | `/api/auth/resend-verification` | Renvoie le lien de vérification |
| POST | `/api/auth/logout` | Révoque la session et efface le cookie |
| GET | `/api/auth/me` | Retourne l'utilisateur de la session |
| GET | `/api/auth/verify-email?token=...` | Vérifie l'adresse e-mail |
| POST | `/api/auth/forgot-password` | Envoie un lien de réinitialisation |
| POST | `/api/auth/reset-password` | Définit un nouveau mot de passe |
| POST | `/api/auth/change-password` | Change le mot de passe de la session |
| GET/PATCH | `/api/profile` | Lit/met à jour le profil |
| POST | `/api/profile/avatar` | Téléverse un avatar (5 Mo max.) |
| POST | `/api/assistant/chat` | Assistant OpenDC, session requise |
| GET | `/api/projects`, `/api/news`, `/api/services` | Contenus publiés |

Les requêtes modifiant l'état nécessitent le cookie CSRF et l'en-tête `X-CSRF-Token`. Le navigateur utilise `credentials: include`. Le jeton de session n'est jamais exposé au JavaScript.

## Variables d'environnement serveur

Copier `.env.example` en `.env` pour le développement.

- `FIREBASE_SERVICE_ACCOUNT_BASE64` : JSON du compte de service encodé en Base64 (serveur uniquement).
- `FIREBASE_STORAGE_BUCKET` : bucket Firebase Storage.
- `CORS_ORIGINS` : liste exacte des origines frontend séparées par des virgules.
- `FRONTEND_URL` : origine frontend, utilisée dans les liens de réinitialisation.
- `PUBLIC_API_URL` : URL publique de l'API, utilisée dans les liens de vérification.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` : transport e-mail.
- `OPENAI_API_KEY` et `OPENAI_MODEL` : assistant (facultatif).

Exemple production :
```env
NODE_ENV=production
CORS_ORIGINS=https://votre-frontend.vercel.app
FRONTEND_URL=https://votre-frontend.vercel.app
PUBLIC_API_URL=https://votre-api.vercel.app
FIREBASE_SERVICE_ACCOUNT_BASE64=...
FIREBASE_STORAGE_BUCKET=votre-projet.appspot.com
SMTP_HOST=smtp.votre-fournisseur.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASSWORD=...
MAIL_FROM=OpenDC <noreply@votre-domaine.com>
```

Ne jamais mettre ces secrets dans le frontend ou dans Git.

## Installation et vérifications

Node.js 22+ :
```bash
npm install
cp .env.example .env
npm run dev
npm test
npm run check
```

`npm test` et `npm run check` vérifient les routes sans avoir besoin d'un compte Firebase configuré. Les parcours inscription/e-mail/session nécessitent les variables Firebase Admin et SMTP.

## Firestore

Le serveur Admin utilise ces collections :
- `users/{uid}` : profil, adresse e-mail, hash Argon2id, état de vérification.
- `authEmailIndex/{sha256(email-normalisé)}` : index unique e-mail → UID.
- `authSessions/{sha256(session-token)}` : UID et expiration de session.
- `authActionTokens/{sha256(action-token)}` : jetons de vérification et de réinitialisation.
- `users/{uid}/assistantConversations/main/messages/{id}` : historique IA.

Configurer la politique TTL Firestore sur `expiresAt` pour nettoyer les sessions et jetons expirés. Les règles Firestore et Storage du dépôt refusent l'accès direct client : seul le backend Admin accède aux données.

## Déploiement Vercel

Importer le dépôt Backend, racine `./`, preset `Other`, puis définir toutes les variables ci-dessus dans Vercel. Le fichier `api/index.js` exporte Express. Vérifier `/api/health`.

## Migration des anciens comptes

Les anciens comptes créés uniquement dans Firebase Authentication ne peuvent pas être convertis automatiquement : Firebase ne fournit pas leurs mots de passe en clair ni leurs hash Argon2id. Les profils Firestore existants peuvent être conservés, mais chaque ancien utilisateur doit créer un nouveau compte avec la nouvelle authentification, ou une migration administrative vérifiée doit être développée avant bascule. Ne jamais importer de mot de passe en clair.

## Limites opérationnelles à régler avant production

- Configurer et tester le SMTP avec un domaine expéditeur vérifié.
- Définir `PUBLIC_API_URL`, `FRONTEND_URL`, `CORS_ORIGINS` et `FIREBASE_STORAGE_BUCKET` selon les domaines réels.
- Utiliser un rate limiter distribué (Redis/Upstash) pour une charge serverless multi-instance ; le limiteur actuel est en mémoire.
- Ajouter un flux de renvoi du mail de vérification et un flux de changement d'adresse e-mail avant de proposer ces actions dans l'interface.
- Configurer la politique TTL Firestore et surveiller les journaux d'authentification.


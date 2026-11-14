# OpenDC Backend — Version 1.0

API Node.js/Express indépendante du projet Infinity, conçue pour être déployée comme fonction serverless sur Vercel.

## 1. Routes et contrat frontend

Le frontend React + Vite existant a été inspecté dans `OpenDC-Version-1.0.zip`. Le client `src/services/api.js` envoie :

- Assistant : `POST /api/assistant/chat` avec `{ "message": "...", "history": [{"role":"user|assistant","content":"..."}] }` et lit `reply` (ou `message`).
- Profil : `GET /api/profile` et `PATCH /api/profile`.
- Projets : `GET /api/projects`, le frontend lit `projects` ou `data`.
- Actualités : `GET /api/news`, le frontend lit `news` ou `data`.
- Services : `GET /api/services`.

Les réponses utilisent `{ "success": true, ... }`. Les erreurs utilisent `{ "success": false, "code": "...", "message": "..." }`.

| Route | Accès | Réponse principale |
|---|---|---|
| `GET /api/health` | Public | `service`, `status`, `timestamp` |
| `POST /api/assistant/chat` | Firebase ID Token | `reply`, `conversationId`, `usage` |
| `GET /api/profile` | Firebase ID Token | `profile` |
| `PATCH /api/profile` | Firebase ID Token | `profile` |
| `GET /api/projects` | Public, contenu publié uniquement | `projects` |
| `GET /api/news` | Public, contenu publié uniquement | `news` |
| `GET /api/services` | Public, contenu publié uniquement | `services` |

Les endpoints publics ne renvoient que les documents dont `status` vaut `published`. Les endpoints du profil et de l'assistant vérifient le jeton Firebase envoyé dans `Authorization: Bearer <Firebase ID Token>`.

## 2. Prérequis

- Node.js 20 ou supérieur.
- Un projet Firebase distinct ou dédié à OpenDC.
- Firebase Authentication activé (méthodes de connexion choisies dans Firebase Console).
- Cloud Firestore créé.
- Firebase Storage activé et son bucket configuré.
- Une clé OpenAI API.
- Un compte Vercel et un dépôt GitHub pour le backend.

## 3. Installation locale

```bash
cd Backend
npm install
cp .env.example .env
```

Remplir `.env` avec les secrets serveur. Ne jamais préfixer ces variables par `VITE_` et ne jamais les placer dans le dépôt Git.

Lancer :

```bash
npm run dev
```

Vérifier :

```bash
curl http://localhost:3000/api/health
```

Exécuter les vérifications :

```bash
npm test
npm run check
```

## 4. Configurer Firebase Admin

Dans Firebase Console → Paramètres du projet → Comptes de service, générer une clé privée pour le compte de service du serveur. Garder le fichier JSON hors du dépôt.

Sur Vercel, méthode recommandée : ajouter `FIREBASE_SERVICE_ACCOUNT_BASE64` contenant le JSON complet encodé en Base64. Pour générer cette valeur sur Linux/macOS :

```bash
base64 -w 0 service-account.json
```

Sur macOS si `-w` n'est pas reconnu :

```bash
base64 < service-account.json | tr -d '\n'
```

Alternative : renseigner `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` et `FIREBASE_PRIVATE_KEY`. Pour la clé privée, conserver les retours à la ligne sous forme `\n` dans la variable Vercel.

Renseigner également `FIREBASE_STORAGE_BUCKET` avec le nom exact du bucket. Le backend utilise Firebase Admin pour vérifier les ID Tokens et accéder à Firestore/Storage. Les inscriptions, connexions, changements d'e-mail et de mot de passe restent gérés par Firebase Authentication dans le frontend ; aucun mot de passe n'est écrit dans Firestore.

### Collections Firestore

Appliquer les règles fournies dans `firestore.rules` et `storage.rules` via Firebase Console → Firestore/Storage → Rules. Elles isolent les profils par UID, interdisent au client d’écrire dans les collections de contenu/connaissances et réservent l’historique IA serveur à Firebase Admin.

Créer/administrer les collections suivantes :

- `users/{uid}` : `firstName`, `lastName`, `birthDate`, `gender`, `email`, `photoURL`, `updatedAt`.
- `projects/{documentId}` : `name`, `description`, `mission`, `objectives` (tableau facultatif), `features` (tableau facultatif), `status: "published"`, `publishedAt`.
- `news/{documentId}` : `title`, `summary`, `content`, `imageURL` (facultatif), `status: "published"`, `publishedAt`.
- `services/{documentId}` : `name`, `description`, `status: "published"`, `publishedAt`. Ne publier aucun service qui n'est pas réellement disponible.
- `knowledgeBase/{documentId}` : `title`, `content`, `tags` (tableau de mots-clés), `language` (facultatif), `status: "published"`, `updatedAt`.

Les documents avec un statut différent de `published` ne sont jamais exposés par les routes de contenu ni utilisés par la recherche de connaissances. Ajouter les contenus depuis Firebase Console ou un outil d'administration protégé ; ne pas donner de droits d'écriture publics à ces collections.

L'assistant récupère des documents pertinents de `knowledgeBase` par correspondance de termes, en complément d'un noyau concis de faits de référence. Cette première version ne dépend pas d'un index vectoriel ou d'un service de recherche externe ; l'architecture pourra évoluer vers des embeddings/vector search sans changer le contrat HTTP.

### Conversations

Le serveur conserve les tours IA dans :

`users/{uid}/assistantConversations/main/messages/{messageId}`

Chaque document contient `role`, `content`, `createdAt`. Les données sont séparées par UID. Le frontend existant conserve aussi son historique d'interface dans `users/{uid}/conversations/main/messages` ; les deux chemins sont volontairement distincts afin de ne pas casser l'historique déjà utilisé par `AssistantPanel.jsx`.

### Firebase Storage

Le frontend existant téléverse déjà les avatars dans `avatars/{uid}/...` via Firebase Storage et enregistre le `photoURL` dans `users/{uid}`. Configurer les règles Storage pour limiter la lecture/écriture au propriétaire du dossier, vérifier le type image et limiter la taille à 5 Mo. Exemple de règles à adapter au projet :

```text
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /avatars/{uid}/{fileName} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if request.auth != null && request.auth.uid == uid
                   && request.resource.size < 5 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
  }
}
```

Ces règles s'appliquent au SDK client. Les accès Admin du serveur contournent les règles Storage et doivent rester strictement côté serveur.

## 5. Configurer OpenAI

Définir `OPENAI_API_KEY` dans l'environnement du serveur et, facultativement, `OPENAI_MODEL` (par défaut `gpt-4o-mini`). La clé n'est jamais envoyée au frontend. L'API renvoie une erreur `503 OPENAI_NOT_CONFIGURED` tant que la clé n'est pas configurée.

L'assistant répond dans la langue du message. Pour les faits spécifiques à OpenDC, il doit s'appuyer sur la base de connaissances et signaler les informations manquantes au lieu de les inventer.

## 6. CORS

Définir `CORS_ORIGINS` avec les origines exactes du site frontend, séparées par des virgules, sans chemin final. Exemple :

```env
CORS_ORIGINS=https://opendc.vercel.app,http://localhost:5173
```

Ne pas utiliser `*` en production avec les routes authentifiées. Ajouter chaque domaine de prévisualisation uniquement si nécessaire.

## 7. Déploiement Vercel

1. Pousser le dossier `Backend` dans le dépôt GitHub indépendant `zenofirminx-pixel/Backend` (racine du dépôt = contenu de ce dossier).
2. Dans Vercel, créer un nouveau projet et importer ce dépôt.
3. Framework Preset : **Other**. Root Directory : `./`.
4. Ajouter toutes les variables de `.env.example` dans Project → Settings → Environment Variables. Configurer les environnements Production et Preview selon les besoins.
5. Déployer. `api/index.js` exporte Express comme fonction serverless ; aucun `app.listen()` n'est appelé dans le chemin Vercel.
6. Tester `https://backend.vercel.app/api/health`.
7. Ajouter le domaine réel du frontend dans `CORS_ORIGINS`, puis redéployer.

Le domaine `https://backend.vercel.app` est une adresse prévue par le projet : il doit être effectivement attribué à ce déploiement dans Vercel avant utilisation.

## 8. Connecter le frontend React + Vite

Dans le `.env` du frontend :

```env
VITE_API_BASE_URL=https://backend.vercel.app
VITE_API_ENABLED=true
```

Le frontend actuel (`src/services/api.js`) récupère `auth.currentUser.getIdToken()` et transmet le jeton en `Authorization: Bearer ...`. Ce backend respecte ce contrat. Ne jamais mettre `OPENAI_API_KEY`, le JSON Firebase Admin ou une clé privée dans les variables `VITE_*`.

Les routes projets et actualités renvoient respectivement `projects` et `news`, ce que les pages actuelles consomment. L'assistant accepte précisément `message` et `history` et renvoie `reply`.

### Profil et e-mail

Le frontend actuel modifie déjà l'e-mail et le mot de passe avec Firebase Authentication et écrit les champs complémentaires dans Firestore. Le PATCH backend ne modifie volontairement pas l'e-mail Auth ni le mot de passe : ces opérations doivent rester dans Firebase Auth, avec réauthentification si nécessaire. Le PATCH ne met à jour que les champs de profil autorisés (`firstName`, `lastName`, `birthDate`, `gender`, `photoURL`).

## 9. Sécurité et limites

- Vérification des Firebase ID Tokens avec `verifyIdToken` et vérification de révocation activée par défaut.
- Routes profil et assistant privées ; documents Firestore isolés par UID.
- Validation stricte Zod, taille JSON limitée à 32 Ko.
- Helmet, CORS en liste blanche, rate limiting global et limite distincte de l'assistant.
- Aucun secret dans le frontend ou le dépôt.
- Les collections publiques sont filtrées par `status == published`.
- Les clés Admin et OpenAI doivent être stockées uniquement dans les variables d'environnement Vercel.

Pour un trafic de production important, remplacer le rate limiter mémoire par un stockage distribué (Redis/Upstash), car l'état mémoire n'est pas partagé entre les instances serverless.

## 10. Codes d'erreur courants

- `401 AUTH_TOKEN_MISSING` / `AUTH_TOKEN_INVALID` : reconnecter l'utilisateur et obtenir un nouvel ID Token.
- `403 CORS_ORIGIN_DENIED` : ajouter l'origine exacte du frontend dans `CORS_ORIGINS`.
- `503 FIREBASE_NOT_CONFIGURED` : variables Firebase Admin manquantes ou incorrectes.
- `503 OPENAI_NOT_CONFIGURED` : `OPENAI_API_KEY` absent.
- `429 RATE_LIMITED` / `ASSISTANT_RATE_LIMITED` : patienter avant de réessayer.
- `400 VALIDATION_ERROR` : vérifier le corps de la requête.

---

OpenDC Backend v1.0 — API indépendante, sans dépendance au backend Infinity.

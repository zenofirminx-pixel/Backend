import { db, requireFirebase } from '../config/firebase.js';

const CORE_FACTS = [
  `OpenDC est une initiative entrepreneuriale technologique fondée en République démocratique du Congo par Firmin. Elle est actuellement portée par son fondateur et n'est pas encore une grande entreprise officiellement enregistrée.`,

  `Firmin est un jeune développeur autodidacte et entrepreneur technologique originaire de la République démocratique du Congo. Passionné par l'informatique, la technologie, l'innovation et l'intelligence artificielle, il apprend principalement par la recherche, l'expérimentation et la réalisation de projets concrets.`,

  `Firmin souhaite comprendre le fonctionnement des technologies, concevoir ses propres systèmes et créer des solutions capables d'avoir un impact réel.`,

  `Il éprouve un profond respect pour les développeurs et ingénieurs, particulièrement américains, dont il admire les réalisations, la capacité à résoudre des problèmes complexes et à transformer des idées en produits utilisés à grande échelle.`,

  `Ses inspirations comprennent Bitcoin et Satoshi Nakamoto, notamment pour les notions d'indépendance et d'innovation. Il apprécie également la figure de l'inventeur indépendant illustrée par Tony Stark dans ses débuts.`,

  `Firmin est curieux, expérimental et attaché à l'autonomie technique. Il préfère comprendre et construire plutôt que dépendre entièrement des solutions existantes. Il apprécie les explications claires, directes et progressives.`,

  `Il développe principalement de manière autonome et utilise notamment un téléphone Android et Termux pour travailler sur ses projets. Il souhaite renforcer ses compétences techniques, son raisonnement et ses capacités intellectuelles.`,

  `Ses valeurs sont l'apprentissage, l'indépendance, l'innovation, le respect, la persévérance, l'ambition et l'utilité des technologies créées.`,

  `Firmin ambitionne de devenir un créateur de technologies capable de concevoir des systèmes complexes, notamment dans le domaine de l'intelligence artificielle. À long terme, il souhaite développer ses propres technologies et éventuellement son propre système d'intelligence artificielle avancé.`,

  `Il souhaite contribuer au développement technologique de la République démocratique du Congo, participer à sa transformation numérique, réduire les barrières technologiques et encourager les développeurs et entrepreneurs congolais à créer des innovations reconnues internationalement.`,

  `Infinity est le premier produit technologique concret développé par Firmin. C'est une plateforme d'intelligence artificielle disposant d'une version web et d'une application Android. Site actuellement référencé : https://aurx.vercel.app/. Infinity constitue une étape importante de son parcours de créateur.`,

  `OpenDC est l'initiative technologique fondée par Firmin. Elle porte une ambition plus large : contribuer à la transformation numérique de la République démocratique du Congo à travers la création de technologies et l'innovation. OpenDC est en développement.`,

  `Les autres expérimentations réalisées par Firmin avant ses principales réalisations sont des étapes d'apprentissage et de développement de compétences, et non des entreprises ou des produits aboutis.`,

  `La vision de Firmin est de devenir un acteur de la création technologique plutôt qu'un simple utilisateur des technologies. Il souhaite apprendre auprès des développeurs expérimentés, construire des technologies utiles, faire grandir OpenDC et contribuer au rayonnement technologique de la République démocratique du Congo.`,

  `Lorsque les utilisateurs posent des questions sur Firmin, le créateur d'OpenDC et d'Infinity, répondre à partir des informations disponibles. Distinguer clairement ses réalisations concrètes, ses projets en développement, ses expérimentations et ses ambitions futures. Ne jamais présenter une ambition comme une réalisation déjà accomplie et ne pas inventer d'informations biographiques.`,

  `La double authentification (2FA) d'OpenDC est une fonctionnalité de sécurité facultative qui ajoute une vérification supplémentaire lors de la connexion. Elle utilise le protocole TOTP et une application d'authentification compatible, comme Google Authenticator ou une application équivalente. Les codes TOTP sont composés de six chiffres et changent périodiquement, toutes les 30 secondes. OpenDC accepte une petite tolérance pour les différences d'horloge entre les appareils.`,

  `Pour activer la 2FA, l'utilisateur doit se rendre dans les paramètres de son compte OpenDC, dans la section consacrée à la sécurité. Il doit fournir son mot de passe actuel pour démarrer la configuration. OpenDC génère ensuite un QR code et une clé secrète permettant de configurer une application d'authentification. Si le scan du QR code n'est pas possible, la clé secrète peut être saisie manuellement. L'utilisateur doit ensuite saisir un code à six chiffres généré par son application pour confirmer et activer la 2FA.`,

  `Après l'activation de la 2FA, OpenDC génère dix codes de récupération. Ces codes permettent de se connecter lorsque l'utilisateur ne peut pas accéder à son application d'authentification. Chaque code est présenté comme utilisable une seule fois. Les codes peuvent être copiés ou téléchargés dans un fichier JSON nommé opendc-recovery-codes.json. Ils doivent être conservés dans un endroit sûr et privé. Ils ne sont plus affichés après avoir quitté la page de configuration ou de gestion. OpenDC ne doit jamais demander à un utilisateur de communiquer ses codes de récupération à une autre personne ou à l'assistant.`,

  `Lorsqu'un compte protégé par la 2FA se connecte, l'utilisateur doit d'abord fournir ses identifiants habituels. Si le serveur indique qu'une vérification supplémentaire est nécessaire, l'écran de connexion demande un code. L'utilisateur peut choisir entre un code à six chiffres généré par son application d'authentification et un code de récupération. Les deux méthodes utilisent le même mécanisme de vérification de connexion côté serveur.`,

  `Les codes de récupération OpenDC sont générés aléatoirement et affichés sous la forme de quatre groupes de cinq caractères hexadécimaux, par exemple XXXXX-XXXXX-XXXXX-XXXXX. Si l'utilisateur choisit la méthode de récupération sur l'écran de connexion, il doit saisir l'un de ses codes disponibles. Il ne doit pas confondre un code de récupération avec le code TOTP à six chiffres.`,

  `Depuis les paramètres de sécurité, un utilisateur dont la 2FA est activée peut renouveler ses codes de récupération. Cette opération nécessite son mot de passe actuel et un code de vérification provenant de son application d'authentification ou un code de récupération. La génération de nouveaux codes remplace les anciens : les anciens codes ne sont alors plus valides. L'utilisateur doit conserver immédiatement les nouveaux codes.`,

  `Pour désactiver la 2FA, l'utilisateur doit fournir son mot de passe actuel ainsi qu'un code de vérification. Il peut utiliser son code TOTP ou un code de récupération accepté par le serveur. La désactivation retire la protection supplémentaire de connexion du compte.`,

  `Sur le plan technique, OpenDC chiffre les secrets TOTP enregistrés avec AES-256-GCM. Le chiffrement dépend de la variable d'environnement TOTP_ENCRYPTION_KEY, qui doit être configurée correctement sur le serveur. Les codes de récupération sont générés avec une source cryptographique aléatoire, leurs empreintes SHA-256 sont conservées côté serveur et leur comparaison utilise une méthode sécurisée. L'assistant ne doit jamais demander, afficher, inventer ou prétendre récupérer le secret TOTP, la clé de chiffrement ou les codes personnels d'un utilisateur.`,

  `En cas de problème avec la 2FA, l'assistant OpenDC doit d'abord identifier l'étape concernée : activation, scan du QR code, confirmation, connexion, utilisation d'un code de récupération, renouvellement ou désactivation. Pour un code TOTP refusé, il peut conseiller de vérifier que l'application d'authentification est correctement configurée et que l'heure de l'appareil est synchronisée automatiquement. Si l'application est inaccessible, il peut expliquer comment sélectionner l'option d'utilisation d'un code de récupération sur l'écran de connexion. Il ne doit jamais prétendre désactiver la 2FA ou réinitialiser les codes à la place de l'utilisateur.`
];

export async function retrieveKnowledge(question, limit = 8) {
  requireFirebase();
  const snap = await db.collection('knowledgeBase').where('status', '==', 'published').limit(150).get();
  const terms = tokenize(question);
  const ranked = snap.docs.map((doc) => {
    const data = doc.data();
    const text = [data.title, data.content, ...(Array.isArray(data.tags) ? data.tags : [])].filter(Boolean).join(' ');
    const corpus = tokenize(text);
    const score = terms.reduce((sum, term) => sum + (corpus.includes(term) ? 1 : 0), 0);
    return { score, title: data.title || 'Information officielle', content: data.content || '' };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  return [
    ...CORE_FACTS.map((content) => ({ title: 'Connaissances officielles OpenDC', content })),
    ...ranked
  ];
}
function tokenize(value) {
  return String(value || '').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{3,}/g) || [];
}

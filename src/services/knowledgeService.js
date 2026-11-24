import { db, requireFirebase } from '../config/firebase.js';

const CORE_FACTS = [
  `Pal est un réseau social en cours de développement. Le backend comporte une API Node.js et utilise Firestore pour les données. L'application Android native doit encore être connectée et les fonctionnalités doivent être déployées et testées avant d'être annoncées comme disponibles aux utilisateurs.`,
  `Le backend Pal dispose de routes pour l'authentification, les profils, le fil d'actualité, les publications textuelles ou avec image, les likes, les commentaires, la recherche de profils, les demandes d'amitié, la liste d'amis, les conversations privées entre amis et les notifications. La disponibilité en production dépend de la configuration du serveur et de Firebase.`,
  `Les images des publications sont reçues sous forme de données Base64 et conservées dans Firestore. Leur taille est limitée pour respecter la limite de taille des documents Firestore. Les images doivent être compressées côté application avant envoi.`,
  `Les routes sociales sont protégées par une session utilisateur. Les requêtes qui modifient des données requièrent également un jeton CSRF. Les messages privés ne peuvent être envoyés ou consultés qu'entre comptes ayant une relation d'amitié acceptée.`,
  `L'assistant Pal ne doit pas prétendre que l'application est déjà déployée, qu'un utilisateur a publié, envoyé un message, reçu une notification ou ajouté un ami si ces actions ne sont pas confirmées par des données réelles. Il doit distinguer les fonctionnalités préparées côté serveur de celles disponibles dans l'application.`
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
    ...CORE_FACTS.map((content) => ({ title: 'Connaissances officielles Pal', content })),
    ...ranked
  ];
}
function tokenize(value) {
  return String(value || '').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{3,}/g) || [];
}

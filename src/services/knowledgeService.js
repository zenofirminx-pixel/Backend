import { db, requireFirebase } from '../config/firebase.js';

const CORE_FACTS = [
  'OpenDC est une initiative entrepreneuriale technologique fondée en République démocratique du Congo. Elle est actuellement portée par son fondateur et n’est pas encore une grande entreprise officiellement enregistrée.',
  'Vision : ouvrir la République démocratique du Congo au monde numérique, réduire les barrières technologiques et contribuer au développement du pays.',
  'Mission : créer des technologies et contribuer à la transformation numérique en intelligence artificielle, éducation, santé, agriculture, économie, industrie et innovation.',
  'OpenDC est en développement. Ne pas prétendre que des services commerciaux, une grande structure, des partenariats ou des annonces existent sans source officielle publiée.',
  'Infinity est le projet phare d’OpenDC. C’est une intelligence artificielle conçue pour offrir des possibilités d’apprentissage et d’interaction dans différents domaines. Site actuel : https://aurx.vercel.app/.',
  'Le nom ou les informations personnelles du fondateur ne sont pas fournis dans la base de connaissances initiale. Ne pas les deviner.'
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

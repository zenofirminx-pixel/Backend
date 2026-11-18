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

  `Lorsque les utilisateurs posent des questions sur Firmin, le créateur d'OpenDC et d'Infinity, répondre à partir des informations disponibles. Distinguer clairement ses réalisations concrètes, ses projets en développement, ses expérimentations et ses ambitions futures. Ne jamais présenter une ambition comme une réalisation déjà accomplie et ne pas inventer d'informations biographiques.`
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

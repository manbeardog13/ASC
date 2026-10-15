// The Saiyan Gym concierge, pointed at ASC.
// A question is answered from these facts in the same tick. No model call.
// The lexical gate is the gym's: meaningful word stems, and a fact wins only
// when it shares more of them than any other fact.
const STOP = new Set(("je li da se su za na u i a o ili ne koja koji koje što sto kako gdje kada kad imate ima imam mogu " +
  "možete mozete vi vas vam ti te tu to ovo the a an is are am do does did you your yours there can could i what whats where " +
  "when how much many it its of to in on for with have has my me we us our bring who get any some be at by from this that").split(" "));

const FACTS = [
  {
    id: "hotel",
    questions: "što je asc hotel gume dubrovnik čime se bavite",
    answer: "ASC je hotel za gume u Dubrovniku. Čuvamo komplete, lijepimo QR naljepnicu i vadimo ih kad kupac dođe.",
  },
  {
    id: "intake",
    questions: "kako zaprimiti nove gume novi komplet unos registraciju ime kupca",
    answer: "Na Zaprimi kreni od registracije, pa ime, telefon, e-pošta i adresa. Ljubičasti broj u kutu pita to redom. Zadnja rečenica je Spremi gume.",
  },
  {
    id: "season",
    questions: "šest mjeseci sezonska zamjena termin raspored bay",
    answer: "Za sezonsku zamjenu uzimamo prvi slobodan termin radnim danom, otprilike za šest mjeseci, od 8 do 16, jedan auto na pola sata.",
  },
  {
    id: "remind",
    questions: "kada javiti kupcu prije dolaska podsjetiti ranije",
    answer: "Ako imamo telefon ili adresu, javljamo pet do sedam dana prije termina, s danom i satom. Termin se može pomaknuti.",
  },
  {
    id: "keep",
    questions: "ostaju kod nas bacanje neodređeno čuvanje zauvijek",
    answer: "Gume mogu ostati do zamjene sezone, ostati kod nas neodređeno, ili ići na bacanje.",
  },
  {
    id: "find",
    questions: "kako pronaći komplet skenirati naljepnicu qr kod",
    answer: "Svaki komplet dobije QR naljepnicu. Skeniraj je, ili otvori Pronađi i upiši oznaku.",
  },
  {
    id: "place",
    questions: "kako smjestiti komplet zona regal polica mjesto",
    answer: "Nakon spremanja komplet ide na zonu, regal, policu i mjesto. To mjesto piše na naljepnici.",
  },
];

function tokens(text) {
  return String(text || "").toLowerCase().replace(/[’']/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOP.has(word));
}

function stem(word) {
  if (word.length >= 5) return word.slice(0, 4);
  if (word.length === 4) return word.slice(0, 3);
  return word;
}

function overlap(question, factText) {
  const words = tokens(factText);
  return new Set(tokens(question).map(stem).filter((part) => words.some((word) => word.startsWith(part)))).size;
}

// Live counts, today's pickups and "find this plate" stay on Gemini.
function wantsLiveData(question) {
  return /\b(nađi|nadi|koliko|izvještaj|izvjestaj)\b/i.test(question)
    || /za danas/i.test(question)
    || /tko (č|c)eka/i.test(question);
}

export function answer(question) {
  const q = String(question || "").trim();
  if (!q || q.length > 500 || wantsLiveData(q)) return null;
  let best = null;
  let bestScore = 0;
  let second = 0;
  for (const fact of FACTS) {
    const score = overlap(q, fact.questions + " " + fact.answer);
    if (score > bestScore) {
      second = bestScore;
      bestScore = score;
      best = fact;
    } else if (score > second) second = score;
  }
  if (!best || bestScore < 2 || bestScore === second) return null;
  return best.answer;
}

if (typeof window !== "undefined") window.ASCConcierge = { answer };

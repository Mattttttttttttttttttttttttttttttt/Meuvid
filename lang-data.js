/* ================================================================
   lang-data.js — all language data arrays
   ================================================================ */

const DICT = [
  ["auzme", "n.", "language; a system of expression and communication"],
  ["auz", "n.", "sound; voice; tone"],
  ["beul", "v.", "to listen; to attend carefully to"],
  ["dren", "v.", "to think; to reflect; to contemplate"],
  ["frael", "adv.", "together; in unison; collectively"],
  ["kuv", "adj.", "clear; transparent; intelligible"],
  ["le", "art.", "the (definite article)"],
  ["meuv", "v.", "to speak; to utter; to communicate"],
  ["niv", "adj.", "new; recent; fresh"],
  ["omé", "n.", "world; totality; all that exists"],
  ["osta", "prep.", "through; by means of; via"],
  ["sol", "n.", "meaning; sense; purpose"],
  ["trae", "conj.", "but; however; yet"],
  ["vesk", "n.", "word; term; discrete expression"],
  ["vid", "n.", "sight; vision; understanding"],
];

const ROOTS = [
  ["auz", "relating to sound, voice, or acoustic phenomena"],
  ["beul", "relating to hearing, listening, or receptive attention"],
  ["dren", "relating to thought, reflection, or cognition"],
  ["frael", "relating to togetherness, unity, or collective action"],
  ["kuv", "relating to clarity, transparency, or comprehensibility"],
  ["me", "relating to self, first-person, or personal expression"],
  ["niv", "relating to novelty, recency, or freshness"],
  ["omé", "relating to wholeness, the world, or totality"],
  ["ost", "relating to passage, traversal, or instrumentality"],
  ["sol", "relating to meaning, purpose, or significance"],
  ["vesk", "relating to words, terms, or discrete expressions"],
  ["vid", "relating to sight, vision, or perceptual understanding"],
];

const GRAMMAR = [
  "# Overview",
  "Meuvid is a constructed language designed for clarity and expressiveness. Its grammar is agglutinative, meaning that words are formed by combining roots with affixes in a regular and predictable manner.",
  "# Word Order",
  "The default word order in Meuvid is Subject–Verb–Object (SVO), mirroring many natural languages. Because Meuvid uses case markers, word order may be freely varied for emphasis without loss of meaning.",
  "# Nouns",
  "Nouns in Meuvid are unmarked for grammatical gender. Number is indicated by an optional suffix: the plural suffix is -em, and the collective suffix is -frael. Nouns take case suffixes to mark their grammatical role in a sentence.",
  "# Verbs",
  "Verbs are conjugated for tense using prefixes: pre- for the past, nu- for the present, and vel- for the future. Aspect may be further marked with -ost (completive) or -en (progressive).",
  "# Adjectives",
  "Adjectives follow the noun they modify and agree in case. The comparative degree is formed with the prefix ku-, and the superlative with kuku-.",
];

const PHONETICS = [
  "# Vowels",
  "Meuvid has five core vowels: a, e, i, o, u. Each is pronounced with a pure, monophthongal quality. Long vowels are written with a macron (ā, ē, ī, ō, ū) and held for approximately twice the duration of short vowels.",
  "# Consonants",
  "The consonant inventory is moderate in size. Stops: p, b, t, d, k, g. Fricatives: f, v, s, z, h. Nasals: m, n. Laterals and rhotics: l, r. The letter r is always trilled or tapped — never an approximant.",
  "# Stress",
  "Stress falls predictably on the penultimate (second-to-last) syllable. In monosyllabic words, the single syllable carries primary stress. Stress does not shift when affixes are added to a stem.",
  "# Phonotactics",
  "Syllables follow a (C)V(C) pattern. Clusters of two consonants are permitted at syllable boundaries but not within a syllable onset or coda.",
];

const PHILOSOPHY = [
  "# The Purpose of Meuvid",
  "Meuvid was not created to replace any natural language. It was created to explore what a language might look like if designed from the ground up with expressive clarity as its highest value, unburdened by the accidents of history and unplanned drift.",
  "# On Ambiguity",
  "Natural languages are rich with ambiguity, and that richness is not a flaw. Meuvid does not seek to eliminate ambiguity entirely — that would be impoverishing. It aims, instead, to make ambiguity deliberate: when a Meuvid expression is ambiguous, it is so by design, not accident.",
  "# Roots as Meaning",
  "Each root in Meuvid carries a defined semantic field. Words are not arbitrary mappings between sound and concept — they are composites of meaning. To know the roots is to understand why every word means what it means.",
  "# A Language of Questions",
  "Meuvid does not presuppose a worldview. It provides tools for asking questions with precision. The underlying philosophy is that language should illuminate thought rather than constrain it.",
];

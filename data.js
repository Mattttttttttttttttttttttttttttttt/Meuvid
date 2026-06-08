/* ================================================================
   data.js — all static data arrays (see lang-data.js for language data)
   ================================================================ */

// SHA-256 hash of the admin password.
// Hardcode this value manually. All devices check against it directly.
const AUTH_HASH = "4cb8efb4109f27d07edf5c585614f55ca0bcd5f981e2e33e6a527f1387a8151d";

// [keyword, description] — shown in the ? modal
const DICT_KEYWORDS = [
  ["pos(x)", "Match words whose part of speech contains x. E.g. pos(n.) for nouns, pos(v.) for verbs."],
  ["all(x)", "Match x across all fields: the word itself, its part of speech, and its definition."],
  ["def(x)", "Match x only within the definition field, ignoring the word string and POS."],
];

const ROOTS_KEYWORDS = [
  ["all(x)", "Match x across all fields: the root string and its definition."],
  ["def(x)", "Match x only within the definition field."],
];

// Navigation items — id must match the page's active id passed to initNav()
const NAV_ITEMS = [
  { id: 'dict', label: 'dictionary', href: 'dict' },
  { id: 'grammar', label: 'grammar', href: 'grammar' },
  { id: 'roots', label: 'roots', href: 'roots' },
  { id: 'phonetics', label: 'phonetics', href: 'phonetics' },
  { id: 'philosophy', label: 'philosophy…', href: 'philosophy' },
];

const HOME_CARDS = [
  { id: 'dict', title: 'Dictionary', href: 'dict', desc: 'Browse and search Meuvid words, parts of speech, and definitions.' },
  { id: 'grammar', title: 'Grammar', href: 'grammar', desc: 'Learn the grammatical structure and rules governing Meuvid.' },
  { id: 'roots', title: 'Roots', href: 'roots', desc: 'Explore the morphological roots from which Meuvid words are built.' },
  { id: 'phonetics', title: 'Phonetics', href: 'phonetics', desc: 'Study the sound system, vowels, consonants, and phonotactics.' },
  { id: 'philosophy', title: 'Philosophy', href: 'philosophy', desc: 'Understand the ideas and intentions behind Meuvid.' },
];

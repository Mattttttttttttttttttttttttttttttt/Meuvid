/* ================================================================
   data.js — all static data arrays (see lang-data.js for language data)
   ================================================================ */

// SHA-256 hash of the admin password.
// Hardcode this value manually. All devices check against it directly.
const AUTH_HASH = "4cb8efb4109f27d07edf5c585614f55ca0bcd5f981e2e33e6a527f1387a8151d";

// [keyword, description] — shown in the ? modal
const DICT_KEYWORDS = [
  ["pos(x)", "Match parts of speech. E.g. pos(n.) for nouns, pos(v.) for verbs."],
  ["all(x)", "Match x across all fields: the word itself, its part of speech, and its definition."],
  ["def(x)", "Match definitions."],
];

const AFFIXES_KEYWORDS = [
  ["all(x)", "Match x across all fields: the affix itself and its definition."],
  ["def(x)", "Match definitions."],
];

// Navigation items — id must match the page's active id passed to initNav()
const NAV_ITEMS = [
  { id: 'dict', label: 'dictionary', href: 'dict' },
  { id: 'grammar', label: 'grammar', href: 'grammar' },
  { id: 'affixes', label: 'affixes', href: 'affixes' },
  { id: 'phonetics', label: 'phonetics', href: 'phonetics' },
  { id: 'philosophy', label: 'philosophy…', href: 'philosophy' },
];

const HOME_CARDS = [
  { id: 'dict', title: 'Dictionary', href: 'dict', desc: 'Meuvid words and definitions' },
  { id: 'grammar', title: 'Grammar', href: 'grammar', desc: 'the grammar and discourse markers' },
  { id: 'affixes', title: 'Affixes', href: 'affixes', desc: 'build words from affixes' },
  { id: 'phonetics', title: 'Phonetics', href: 'phonetics', desc: 'Meuvid\'s easy pronunciation rules' },
  { id: 'philosophy', title: 'Philosophy', href: 'philosophy', desc: 'communication guidelines and more' },
];

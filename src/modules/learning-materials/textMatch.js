'use strict';

// Shared text matching for Key Vocab and Dictionary. Passages pasted from Word/PDF carry curly quotes,
// non-breaking spaces and dash variants, while the AI (or the user editing a chip) often types the plain
// form — “night’s” vs "night's". Every "does this term appear in this text" check goes through here.

const QUOTES = [[/[‘’‚‛′`´]/g, "'"], [/[“”„‟″]/g, '"']];
const DASHES = /[‐‑‒–—―−]/g;

function canonicalText(value) {
  let text = String(value ?? '').normalize('NFKC');
  for (const [pattern, replacement] of QUOTES) text = text.replace(pattern, replacement);
  return text.replace(DASHES, '-').replace(/[\s   ]+/g, ' ').trim();
}

const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole-term match (not inside another word). Spaces inside the term match any run of whitespace.
function termPattern(term, flags = 'iu') {
  const value = canonicalText(term);
  if (!value) return null;
  const body = value.split(' ').map(escapePattern).join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, flags);
}

function containsTerm(text, term, { caseSensitive = false } = {}) {
  const pattern = termPattern(term, caseSensitive ? 'u' : 'iu');
  return Boolean(pattern) && pattern.test(canonicalText(text));
}

// The exact substring of `text` that matches `term` (keeps the passage's own quotes/casing), or ''.
function findTerm(text, term) {
  const source = String(text ?? '');
  const canonical = canonicalText(source);
  const pattern = termPattern(term);
  if (!pattern) return '';
  const match = canonical.match(pattern);
  if (!match) return '';
  // canonicalText only swaps single characters and collapses whitespace, so map back by searching
  // the original text with a quote/space-tolerant pattern.
  const loose = canonicalText(term).split(' ').map(word => escapePattern(word)
    .replace(/'/g, "['‘’‚‛′`´]")
    .replace(/"/g, '["“”„‟″]')
    .replace(/-/g, '[-‐-―−]')).join('[\\s   ]+');
  const original = source.normalize('NFKC').match(new RegExp(`(?<![\\p{L}\\p{N}_])${loose}(?![\\p{L}\\p{N}_])`, 'iu'));
  return original ? original[0] : match[0];
}

module.exports = { canonicalText, containsTerm, findTerm, escapePattern };

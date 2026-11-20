'use strict';

// The passage (or transcript) a question set is about. Shared by generation and stale detection:
// both must pick the same text or every question pack would show as stale.
// A question-only set (Part 1/2/5) has passageIndex null and never borrows another set's passage.
function passageForSet(segments, set) {
  const meta = set?.meta;
  if (meta?.questionOnly === true || (meta && Object.hasOwn(meta, 'passageIndex') && meta.passageIndex === null)) return undefined;
  const passages = segments.filter(segment => segment.kind === 'passage');
  return passages.find(segment => segment.position === meta?.passageIndex) || passages[0];
}

module.exports = { passageForSet };

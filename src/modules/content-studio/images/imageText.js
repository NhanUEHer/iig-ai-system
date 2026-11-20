'use strict';

// The <image_description> block a question set sends to cs.question_pack.
// Shared by generation (what is sent) and stale detection (what the pack was built from).
// rows: images of the set in position order, each { number: question number | null, content }.
function formatImageDescriptions(rows) {
  return rows.map((row, index) => {
    const label = row.number ? `[Image for question ${row.number}]` : `[Image ${index + 1} for this question set]`;
    const type = row.content?.imageType ? ` (${row.content.imageType})` : '';
    return `${label}${type}\n${String(row.content?.description || '').trim()}`;
  }).filter(text => text.trim()).join('\n\n');
}

// Only finished descriptions are used (ready, or needs_review after an [unclear] flag).
const usableDescription = artifact => Boolean(artifact?.content && ['ready', 'needs_review'].includes(artifact.status));

// Same selection as the generation query, from the item already loaded by getItem.
function descriptionForSet(setId, images, artifacts, questions) {
  const byImage = new Map(artifacts.filter(artifact => artifact.type === 'image_description').map(artifact => [artifact.imageId, artifact]));
  const rows = images
    .filter(image => image.segmentId === setId || !image.segmentId)
    .sort((a, b) => a.position - b.position)
    .map(image => ({ image, artifact: byImage.get(image.id) }))
    .filter(({ artifact }) => usableDescription(artifact))
    .map(({ image, artifact }) => ({ number: questions.find(question => question.id === image.questionId)?.number || null, content: artifact.content }));
  return formatImageDescriptions(rows);
}

module.exports = { formatImageDescriptions, descriptionForSet, usableDescription };

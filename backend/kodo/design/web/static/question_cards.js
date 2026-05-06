export function normalizeQuestionCards(cards) {
  return (cards || []).map((card, index) => ({
    id: card.id || `q${index + 1}`,
    question: card.question || '',
    options: Array.isArray(card.options) ? card.options : [],
    type: card.type || 'single',
    allowFreeText: card.allow_free_text !== false,
  }));
}

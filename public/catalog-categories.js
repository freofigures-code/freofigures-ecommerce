export const CATEGORY_LABELS = Object.freeze({
  games: 'Geek/Gamer',
  religioso: 'Religioso',
  feito_por_voces: 'Feito por vocês',
});
export const LEGACY_CATEGORIES = ['anime', 'filmes', 'keycaps', 'personalizado', 'lifestyle', 'outros'];
export function normalizeCategory(category) {
  if (category === 'kit_fixo' || category === 'montar_kit') return category;
  if (Object.hasOwn(CATEGORY_LABELS, category)) return category;
  return LEGACY_CATEGORIES.includes(category) ? 'games' : 'Todos';
}
export function categoryLabel(category) {
  return CATEGORY_LABELS[normalizeCategory(category)] || 'Geek/Gamer';
}

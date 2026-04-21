export const DESTINATION_ACCENT = {
  home: 'home',
  readiness: 'readiness',
  sleep: 'sleep',
  activity: 'activity',
  'heart-rate': 'heart-rate',
  stress: 'stress',
  strain: 'strain',
  default: 'home'
};

export function destinationAccentClass(domain) {
  const tone = DESTINATION_ACCENT[domain] || DESTINATION_ACCENT.default;
  return `card-accent-${tone}`;
}

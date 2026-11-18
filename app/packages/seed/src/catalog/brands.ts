// Invented names only. Each prefix/suffix pair is one brand: 10 x 8 = 80 brands.
const brandPrefixes = [
  'Nordvik',
  'Velamare',
  'Ostrava',
  'Calder',
  'Mirren',
  'Tovelund',
  'Basaltine',
  'Linnhaven',
  'Corvetta',
  'Haldegaard',
];
const brandSuffixes = [
  'Studio',
  'Atelier',
  'Denim',
  'Supply',
  'Works',
  'Line',
  'Field',
  'Collective',
];
const premiumSuffixes = new Set(['Atelier']);

export const brandNames = brandPrefixes.flatMap((prefix) =>
  brandSuffixes.map((suffix) => ({
    name: `${prefix} ${suffix}`,
    isPremium: premiumSuffixes.has(suffix) || prefix === 'Haldegaard',
  })),
);

import type { ProductAttributes } from './views';

// Attributes are stored with the retail feed's snake_case keys and exposed in camelCase.
const storageKeys = {
  materialComposition: 'material_composition',
  fit: 'fit',
  pattern: 'pattern',
  neckline: 'neckline',
  sleeveLength: 'sleeve_length',
  length: 'length',
  closure: 'closure',
  careInstructions: 'care_instructions',
  heelHeightCm: 'heel_height_cm',
  upperMaterial: 'upper_material',
  soleMaterial: 'sole_material',
  season: 'season',
} as const satisfies Record<keyof ProductAttributes, string>;

export function attributesFromStorage(stored: Record<string, unknown>): ProductAttributes {
  const attributes: Record<string, unknown> = {};
  for (const [key, storageKey] of Object.entries(storageKeys)) {
    if (stored[storageKey] !== undefined) {
      attributes[key] = stored[storageKey];
    }
  }
  return attributes;
}

export function attributesToStorage(attributes: ProductAttributes): Record<string, unknown> {
  const stored: Record<string, unknown> = {};
  for (const [key, storageKey] of Object.entries(storageKeys)) {
    const value = attributes[key as keyof ProductAttributes];
    if (value !== undefined) {
      stored[storageKey] = value;
    }
  }
  return stored;
}

import { Type, type Static, type TLiteral, type TSchema, type TUnion } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  colorFamilies,
  imageKinds,
  publicationStatuses,
  sizeAvailabilities,
  targetGroups,
} from './catalog';
import { DomainError } from './errors';

// The cast keeps the static type as the literal union instead of widening to string.
const oneOf = <T extends readonly string[]>(values: T) =>
  Type.Union(values.map((value) => Type.Literal(value))) as TUnion<TLiteral<T[number]>[]>;

const cents = Type.Integer({ minimum: 1, maximum: 10_000_000 });

const MaterialShare = Type.Object(
  { material: Type.String({ minLength: 1 }), pct: Type.Integer({ minimum: 1, maximum: 100 }) },
  { additionalProperties: false },
);

export const ProductAttributesInput = Type.Partial(
  Type.Object(
    {
      materialComposition: Type.Array(MaterialShare, { maxItems: 10 }),
      fit: Type.String(),
      pattern: Type.String(),
      neckline: Type.String(),
      sleeveLength: Type.String(),
      length: Type.String(),
      closure: Type.String(),
      careInstructions: Type.String(),
      heelHeightCm: Type.Integer({ minimum: 0, maximum: 30 }),
      upperMaterial: Type.String(),
      soleMaterial: Type.String(),
      season: Type.String({ pattern: '^(SS|AW)\\d{2}$' }),
    },
    { additionalProperties: false },
  ),
);

export const SizeInput = Type.Object(
  {
    label: Type.String({ minLength: 1 }),
    gtin: Type.String({ pattern: '^\\d{13}$' }),
    availability: Type.Optional(oneOf(sizeAvailabilities)),
  },
  { additionalProperties: false },
);

export const ImageInput = Type.Object(
  {
    kind: oneOf(imageKinds),
    url: Type.String({ minLength: 1 }),
    width: Type.Integer({ minimum: 1 }),
    height: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export const ArticleCreateInput = Type.Object(
  {
    articleSku: Type.String({ pattern: '^[A-Z0-9]{6,16}-[A-Z0-9]{2,6}$' }),
    colorName: Type.String({ minLength: 1, maxLength: 100 }),
    colorFamily: oneOf(colorFamilies),
    priceCents: cents,
    originalPriceCents: Type.Optional(Type.Union([cents, Type.Null()])),
    status: Type.Optional(oneOf(publicationStatuses)),
    sizes: Type.Array(SizeInput, { minItems: 1, maxItems: 40 }),
    images: Type.Array(ImageInput, { maxItems: 12, default: [] }),
  },
  { additionalProperties: false },
);
export type ArticleCreateInput = Static<typeof ArticleCreateInput>;

export const ProductCreateInput = Type.Object(
  {
    modelSku: Type.String({ pattern: '^[A-Z0-9]{6,16}$' }),
    brandSlug: Type.String({ minLength: 1 }),
    categorySlug: Type.String({ minLength: 1 }),
    sizeChartId: Type.Integer({ minimum: 1 }),
    targetGroup: oneOf(targetGroups),
    name: Type.String({ minLength: 1, maxLength: 200 }),
    description: Type.String({ maxLength: 5000, default: '' }),
    attributes: Type.Optional(ProductAttributesInput),
    sustainability: Type.Array(Type.String({ minLength: 1 }), { maxItems: 10, default: [] }),
    status: Type.Optional(oneOf(publicationStatuses)),
    articles: Type.Array(ArticleCreateInput, { minItems: 1, maxItems: 20 }),
  },
  { additionalProperties: false },
);
export type ProductCreateInput = Static<typeof ProductCreateInput>;

export const ProductPatchInput = Type.Partial(
  Type.Object(
    {
      brandSlug: Type.String({ minLength: 1 }),
      categorySlug: Type.String({ minLength: 1 }),
      targetGroup: oneOf(targetGroups),
      name: Type.String({ minLength: 1, maxLength: 200 }),
      description: Type.String({ maxLength: 5000 }),
      attributes: ProductAttributesInput,
      sustainability: Type.Array(Type.String({ minLength: 1 }), { maxItems: 10 }),
      status: oneOf(publicationStatuses),
    },
    { additionalProperties: false, minProperties: 1 },
  ),
);
export type ProductPatchInput = Static<typeof ProductPatchInput>;

export const ArticlePatchInput = Type.Partial(
  Type.Object(
    {
      colorName: Type.String({ minLength: 1, maxLength: 100 }),
      priceCents: cents,
      originalPriceCents: Type.Union([cents, Type.Null()]),
      status: oneOf(publicationStatuses),
    },
    { additionalProperties: false, minProperties: 1 },
  ),
);
export type ArticlePatchInput = Static<typeof ArticlePatchInput>;

export const SizeAvailabilityInput = Type.Object(
  { availability: oneOf(sizeAvailabilities) },
  { additionalProperties: false },
);
export type SizeAvailabilityInput = Static<typeof SizeAvailabilityInput>;

// Applies schema defaults, then validates. Paths in field errors use dots
// ("articles.0.sizes.1.gtin") like the read API.
export function parseInput<T extends TSchema>(schema: T, input: unknown): Static<T> {
  const value = Value.Default(schema, structuredClone(input));
  if (Value.Check(schema, value)) {
    return value;
  }
  const fieldErrors = [...Value.Errors(schema, value)].map((error) => ({
    path: error.path.slice(1).replaceAll('/', '.') || '(body)',
    message: error.message,
  }));
  throw new DomainError('validation_failed', 'The request body is invalid.', fieldErrors);
}

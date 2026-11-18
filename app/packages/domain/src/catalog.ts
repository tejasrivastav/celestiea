export const targetGroups = ['women', 'men', 'kids_girls', 'kids_boys', 'unisex'] as const;
export type TargetGroup = (typeof targetGroups)[number];

export const publicationStatuses = ['draft', 'active', 'archived'] as const;
export type PublicationStatus = (typeof publicationStatuses)[number];

export const colorFamilies = [
  'black',
  'white',
  'grey',
  'blue',
  'navy',
  'red',
  'pink',
  'green',
  'khaki',
  'beige',
  'brown',
  'yellow',
  'orange',
  'purple',
  'multicolour',
] as const;
export type ColorFamily = (typeof colorFamilies)[number];

export const sizeSystems = ['alpha', 'eu_shoe', 'jeans', 'kids_height', 'one_size'] as const;
export type SizeSystem = (typeof sizeSystems)[number];

export const sizeAvailabilities = ['in_stock', 'low_stock', 'out_of_stock'] as const;
export type SizeAvailability = (typeof sizeAvailabilities)[number];

export const imageKinds = ['packshot', 'model', 'detail'] as const;
export type ImageKind = (typeof imageKinds)[number];

export const articleSorts = ['popular', 'price_asc', 'price_desc', 'newest', 'discount'] as const;
export type ArticleSort = (typeof articleSorts)[number];

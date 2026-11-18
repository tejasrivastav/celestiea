import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import type { Brand, Category, ColorFamily, SizeChart } from '../api/catalog';
import { toggleListValue } from '../lib/catalog-url';
import { swatchColors } from '../lib/colors';
import { parseEuros } from '../lib/money';
import { formText } from '../lib/form';

interface FilterPanelProps {
  category: Category | undefined;
  brands: Brand[];
  sizeCharts: SizeChart[];
}

// Offers the sizes that make sense for the current department instead of every chart.
function sizeOptions(category: Category | undefined, sizeCharts: SizeChart[]): string[] {
  const path = category?.path ?? '';
  const system = path.includes('shoes')
    ? 'eu_shoe'
    : path.includes('jeans')
      ? 'jeans'
      : path.startsWith('kids')
        ? 'kids_height'
        : 'alpha';
  const sizes = sizeCharts
    .filter((chart) => chart.system === system)
    .flatMap((chart) => chart.sizes);
  return [...new Set(sizes)];
}

export function FilterPanel({ category, brands, sizeCharts }: FilterPanelProps) {
  const [search, setSearch] = useSearchParams();
  const selected = (name: string) => new Set(search.get(name)?.split(',') ?? []);
  const selectedBrands = selected('brand');
  const selectedColors = selected('color');
  const selectedSizes = selected('size');

  function applyPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams(search);
    for (const [field, param] of [
      ['min', 'minPrice'],
      ['max', 'maxPrice'],
    ] as const) {
      const cents = parseEuros(formText(form, field));
      if (cents === null) {
        next.delete(param);
      } else {
        next.set(param, String(cents));
      }
    }
    setSearch(next);
  }

  function toggleSale() {
    const next = new URLSearchParams(search);
    if (next.get('onSale') === 'true') {
      next.delete('onSale');
    } else {
      next.set('onSale', 'true');
    }
    setSearch(next);
  }

  const euros = (param: string) => {
    const cents = search.get(param);
    return cents === null ? '' : String(Number(cents) / 100);
  };

  return (
    <div className="filters">
      <h2 className="visually-hidden">Filter</h2>
      <label className="toggle">
        <input type="checkbox" checked={search.get('onSale') === 'true'} onChange={toggleSale} />
        On sale
      </label>

      <fieldset>
        <legend>Colour</legend>
        <div className="swatches">
          {(Object.keys(swatchColors) as ColorFamily[]).map((color) => (
            <button
              key={color}
              type="button"
              className="swatch"
              style={{ background: swatchColors[color] }}
              aria-pressed={selectedColors.has(color)}
              aria-label={color}
              title={color}
              onClick={() => setSearch(toggleListValue(search, 'color', color))}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Size</legend>
        <div className="chips">
          {sizeOptions(category, sizeCharts).map((size) => (
            <button
              key={size}
              type="button"
              className="chip"
              aria-pressed={selectedSizes.has(size)}
              onClick={() => setSearch(toggleListValue(search, 'size', size))}
            >
              {size}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Price (€)</legend>
        <form className="price-range" onSubmit={applyPrice} key={search.toString()}>
          <label>
            <span className="visually-hidden">Minimum price</span>
            <input
              name="min"
              inputMode="decimal"
              placeholder="Min"
              defaultValue={euros('minPrice')}
            />
          </label>
          <label>
            <span className="visually-hidden">Maximum price</span>
            <input
              name="max"
              inputMode="decimal"
              placeholder="Max"
              defaultValue={euros('maxPrice')}
            />
          </label>
          <button className="button small" type="submit">
            Apply
          </button>
        </form>
      </fieldset>

      <fieldset>
        <legend>Brand</legend>
        <ul className="brand-list">
          {brands.map((brand) => (
            <li key={brand.slug}>
              <label>
                <input
                  type="checkbox"
                  checked={selectedBrands.has(brand.slug)}
                  onChange={() => setSearch(toggleListValue(search, 'brand', brand.slug))}
                />
                {brand.name}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </div>
  );
}

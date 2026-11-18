import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import {
  adminApi,
  type AdminProduct,
  type ProductCreateBody,
  type PublicationStatus,
} from '../../api/admin';
import type { ColorFamily } from '../../api/catalog';
import { useReferenceData } from '../../components/useReferenceData';
import { swatchColors } from '../../lib/colors';
import { parseEuros } from '../../lib/money';
import { ProblemMessage } from './ProblemMessage';
import { formText } from '../../lib/form';

interface ColourDraft {
  articleSku: string;
  colorName: string;
  colorFamily: ColorFamily;
  price: string;
  originalPrice: string;
  gtins: Record<string, string>;
}

const emptyColour = (): ColourDraft => ({
  articleSku: '',
  colorName: '',
  colorFamily: 'black',
  price: '',
  originalPrice: '',
  gtins: {},
});

export function CreateProductForm({
  token,
  onCreated,
}: {
  token: string;
  onCreated: (product: AdminProduct) => void;
}) {
  const reference = useReferenceData();
  const [chartId, setChartId] = useState<string>('');
  const [colours, setColours] = useState<ColourDraft[]>([emptyColour()]);
  // One key per intended product: a retry after a timeout reuses it, so the API returns
  // the first result instead of creating a duplicate. A new key is drawn after success.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const create = useMutation({
    mutationFn: (body: ProductCreateBody) => adminApi.create(token, body, idempotencyKey),
    onSuccess: (product) => {
      setIdempotencyKey(crypto.randomUUID());
      setColours([emptyColour()]);
      if (product) {
        onCreated(product);
      }
    },
  });

  const chart = reference.data?.sizeCharts.find((candidate) => candidate.id === chartId);
  const leafCategories = reference.data?.categories.filter((category) => category.isLeaf) ?? [];

  function updateColour(index: number, change: Partial<ColourDraft>) {
    setColours((current) =>
      current.map((colour, i) => (i === index ? { ...colour, ...change } : colour)),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => formText(form, name);
    create.mutate({
      modelSku: field('modelSku'),
      brandSlug: field('brand'),
      categorySlug: field('category'),
      sizeChartId: Number(chartId),
      targetGroup: field('targetGroup'),
      name: field('name'),
      description: field('description'),
      status: field('status') as PublicationStatus,
      articles: colours.map((colour) => ({
        articleSku: colour.articleSku.trim(),
        colorName: colour.colorName.trim(),
        colorFamily: colour.colorFamily,
        priceCents: parseEuros(colour.price) ?? 0,
        originalPriceCents:
          colour.originalPrice.trim() === '' ? null : parseEuros(colour.originalPrice),
        sizes: Object.entries(colour.gtins)
          .filter(([, gtin]) => gtin.trim() !== '')
          .map(([label, gtin]) => ({ label, gtin: gtin.trim() })),
      })),
    });
  }

  return (
    <section aria-labelledby="create-title">
      <h2 id="create-title">Create a product</h2>
      <form className="create-form" onSubmit={submit}>
        <label>
          Model SKU
          <input name="modelSku" placeholder="NS1234567" required />
        </label>
        <label>
          Name
          <input name="name" placeholder="Relaxed fit linen shirt" required />
        </label>
        <label>
          Brand
          <select name="brand" required>
            {reference.data?.brands.map((brand) => (
              <option key={brand.slug} value={brand.slug}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select name="category" required>
            {leafCategories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.path.replaceAll('.', ' › ').replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target group
          <select name="targetGroup">
            {['women', 'men', 'kids_girls', 'kids_boys', 'unisex'].map((group) => (
              <option key={group}>{group}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue="draft">
            <option>draft</option>
            <option>active</option>
          </select>
        </label>
        <label className="wide">
          Description
          <textarea name="description" rows={3} />
        </label>
        <label>
          Size chart
          <select value={chartId} onChange={(event) => setChartId(event.target.value)} required>
            <option value="">Choose…</option>
            {reference.data?.sizeCharts.map((sizeChart) => (
              <option key={sizeChart.id} value={sizeChart.id}>
                {sizeChart.name}
              </option>
            ))}
          </select>
        </label>

        {colours.map((colour, index) => (
          <fieldset className="wide colour-draft" key={index}>
            <legend>Colour {index + 1}</legend>
            <label>
              Article SKU
              <input
                value={colour.articleSku}
                placeholder="NS1234567-K11"
                required
                onChange={(event) => updateColour(index, { articleSku: event.target.value })}
              />
            </label>
            <label>
              Colour name
              <input
                value={colour.colorName}
                required
                onChange={(event) => updateColour(index, { colorName: event.target.value })}
              />
            </label>
            <label>
              Colour family
              <select
                value={colour.colorFamily}
                onChange={(event) =>
                  updateColour(index, { colorFamily: event.target.value as ColorFamily })
                }
              >
                {Object.keys(swatchColors).map((family) => (
                  <option key={family}>{family}</option>
                ))}
              </select>
            </label>
            <label>
              Price (€)
              <input
                value={colour.price}
                inputMode="decimal"
                required
                onChange={(event) => updateColour(index, { price: event.target.value })}
              />
            </label>
            <label>
              Original price (€), for sales
              <input
                value={colour.originalPrice}
                inputMode="decimal"
                onChange={(event) => updateColour(index, { originalPrice: event.target.value })}
              />
            </label>
            {chart && (
              <div className="wide size-gtins">
                <p className="hint">Enter a 13-digit GTIN for each size this colour comes in.</p>
                {chart.sizes.map((size) => (
                  <label key={size}>
                    {size}
                    <input
                      value={colour.gtins[size] ?? ''}
                      inputMode="numeric"
                      onChange={(event) =>
                        updateColour(index, {
                          gtins: { ...colour.gtins, [size]: event.target.value },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        ))}
        <div className="wide form-actions">
          <button
            className="button"
            type="button"
            onClick={() => setColours([...colours, emptyColour()])}
          >
            Add colour
          </button>
          <button className="button primary" type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create product'}
          </button>
        </div>
      </form>
      <ProblemMessage error={create.error} />
    </section>
  );
}

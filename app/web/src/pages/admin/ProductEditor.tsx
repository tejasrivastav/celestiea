import { useMutation } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { adminApi, type AdminProduct, type PublicationStatus } from '../../api/admin';
import type { SizeAvailability } from '../../api/catalog';
import { formatPrice, parseEuros } from '../../lib/money';
import { ProblemMessage } from './ProblemMessage';
import { formText } from '../../lib/form';

interface EditorProps {
  token: string;
  product: AdminProduct;
  onChange: (product: AdminProduct | null) => void;
}

const statuses: PublicationStatus[] = ['draft', 'active', 'archived'];
const availabilities: SizeAvailability[] = ['in_stock', 'low_stock', 'out_of_stock'];

// Every write sends the version it was based on (If-Match). The response is the updated
// product, which replaces local state instead of re-reading a possibly lagging replica.
export function ProductEditor({ token, product, onChange }: EditorProps) {
  const write = useMutation({
    mutationFn: (request: (current: AdminProduct) => Promise<AdminProduct | null>) =>
      request(product),
    onSuccess: onChange,
  });

  function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = formText(form, 'name');
    const status = formText(form, 'status') as PublicationStatus;
    write.mutate((current) => adminApi.updateProduct(token, current, { name, status }));
  }

  function savePrice(event: FormEvent<HTMLFormElement>, sku: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const priceCents = parseEuros(formText(form, 'price'));
    const originalInput = formText(form, 'original');
    const originalPriceCents = originalInput === '' ? null : parseEuros(originalInput);
    if (priceCents === null || (originalInput !== '' && originalPriceCents === null)) {
      return;
    }
    const status = formText(form, 'status') as PublicationStatus;
    write.mutate((current) =>
      adminApi.updateArticle(token, current, sku, { priceCents, originalPriceCents, status }),
    );
  }

  function remove() {
    if (window.confirm(`Delete ${product.name} and all its colours?`)) {
      write.mutate((current) => adminApi.deleteProduct(token, current));
    }
  }

  return (
    <section className="editor" aria-labelledby="editor-title">
      <h2 id="editor-title">
        {product.modelSku} <span className="hint">version {product.version}</span>
      </h2>
      <ProblemMessage error={write.error} />
      <form className="inline-form" onSubmit={saveProduct}>
        <label>
          Name
          <input name="name" defaultValue={product.name} required />
        </label>
        <label>
          Status
          <select name="status" defaultValue={product.status}>
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <button className="button" type="submit" disabled={write.isPending}>
          Save product
        </button>
        <button className="button danger" type="button" onClick={remove} disabled={write.isPending}>
          Delete product
        </button>
      </form>

      {product.articles.map((article) => (
        <div className="editor-article" key={article.sku}>
          <h3>
            {article.sku} · {article.colorName}
          </h3>
          <form className="inline-form" onSubmit={(event) => savePrice(event, article.sku)}>
            <label>
              Price (€)
              <input
                name="price"
                inputMode="decimal"
                defaultValue={article.price.currentCents / 100}
                required
              />
            </label>
            <label>
              Original price (€), for sales
              <input
                name="original"
                inputMode="decimal"
                defaultValue={
                  article.price.originalCents === null ? '' : article.price.originalCents / 100
                }
              />
            </label>
            <label>
              Status
              <select name="status" defaultValue={article.status}>
                {statuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <button className="button" type="submit" disabled={write.isPending}>
              Save colour
            </button>
            <button
              className="button danger"
              type="button"
              disabled={write.isPending}
              onClick={() =>
                write.mutate((current) => adminApi.deleteArticle(token, current, article.sku))
              }
            >
              Delete colour
            </button>
          </form>
          <p className="hint">
            Now {formatPrice(article.price.currentCents)}
            {article.price.originalCents !== null &&
              ` (was ${formatPrice(article.price.originalCents)})`}
          </p>
          <table className="sizes">
            <thead>
              <tr>
                <th scope="col">Size</th>
                <th scope="col">GTIN</th>
                <th scope="col">Availability</th>
              </tr>
            </thead>
            <tbody>
              {article.sizes.map((size) => (
                <tr key={size.label}>
                  <td>{size.label}</td>
                  <td>{size.gtin}</td>
                  <td>
                    <select
                      aria-label={`Availability of size ${size.label}`}
                      value={size.availability}
                      disabled={write.isPending}
                      onChange={(event) => {
                        const availability = event.target.value as SizeAvailability;
                        write.mutate((current) =>
                          adminApi.setSizeAvailability(
                            token,
                            current,
                            article.sku,
                            size.label,
                            availability,
                          ),
                        );
                      }}
                    >
                      {availabilities.map((availability) => (
                        <option key={availability}>{availability}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

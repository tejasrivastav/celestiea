import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { adminApi, type AdminProduct } from '../../api/admin';
import { CreateProductForm } from './CreateProductForm';
import { ProblemMessage } from './ProblemMessage';
import { ProductEditor } from './ProductEditor';
import { formText } from '../../lib/form';

// The token lives in component state only: it is gone on reload and never touches storage.
export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const search = useMutation({
    mutationFn: (sku: string) => adminApi.findBySku(token ?? '', sku),
    onSuccess: setProduct,
  });

  if (token === null) {
    return <TokenForm onSubmit={setToken} />;
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sku = formText(new FormData(event.currentTarget), 'sku');
    if (sku !== '') {
      search.mutate(sku);
    }
  }

  return (
    <div className="admin">
      <h1>Catalog admin</h1>
      <section aria-labelledby="find-title">
        <h2 id="find-title">Find a product</h2>
        <form className="inline-form" onSubmit={onSearch}>
          <label>
            Model or article SKU
            <input name="sku" required />
          </label>
          <button className="button" type="submit" disabled={search.isPending}>
            Find
          </button>
        </form>
        <ProblemMessage error={search.error} />
      </section>
      {product && (
        <ProductEditor token={token} product={product} onChange={setProduct} key={product.id} />
      )}
      <CreateProductForm token={token} onCreated={setProduct} />
    </div>
  );
}

function TokenForm({ onSubmit }: { onSubmit: (token: string) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = formText(new FormData(event.currentTarget), 'token');
    if (token !== '') {
      onSubmit(token);
    }
  }
  return (
    <form className="admin token-form" onSubmit={submit}>
      <h1>Catalog admin</h1>
      <label>
        Admin token
        <input name="token" type="password" autoComplete="off" required />
      </label>
      <p className="hint">Kept in memory for this tab only.</p>
      <button className="button primary" type="submit">
        Continue
      </button>
    </form>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { fetchProductByArticleSku, type Product } from '../api/catalog';
import { swatchColors } from '../lib/colors';
import { formatPrice } from '../lib/money';

export default function ProductPage() {
  const { articleSku = '' } = useParams();
  const product = useQuery({
    queryKey: ['product-by-article', articleSku],
    queryFn: () => fetchProductByArticleSku(articleSku),
  });

  if (product.isPending) {
    return <p className="status">Loading…</p>;
  }
  if (product.isError) {
    return <p className="status error">We couldn't load this product. Try again.</p>;
  }
  if (product.data === null) {
    return <p className="status">This product is no longer available.</p>;
  }
  return <ProductDetail key={articleSku} product={product.data} articleSku={articleSku} />;
}

function ProductDetail({ product, articleSku }: { product: Product; articleSku: string }) {
  const article =
    product.articles.find((candidate) => candidate.sku === articleSku) ?? product.articles[0]!;
  const [imageIndex, setImageIndex] = useState(0);
  const [size, setSize] = useState<string | null>(null);
  const image = article.images[imageIndex];
  const { attributes } = product;
  const { price } = article;
  const details: [string, string | null][] = [
    [
      'Material',
      attributes.materialComposition
        ?.map((share) => `${share.pct}% ${share.material}`)
        .join(', ') ?? null,
    ],
    ['Fit', attributes.fit],
    ['Pattern', attributes.pattern],
    ['Neckline', attributes.neckline],
    ['Sleeve length', attributes.sleeveLength],
    ['Length', attributes.length],
    ['Closure', attributes.closure],
    ['Upper', attributes.upperMaterial],
    ['Sole', attributes.soleMaterial],
    ['Heel height', attributes.heelHeightCm === null ? null : `${attributes.heelHeightCm} cm`],
    ['Care', attributes.careInstructions],
  ];

  return (
    <article className="product">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to={`/c/${product.category.slug}`}>{product.category.name}</Link>
      </nav>
      <div className="product-layout">
        <div className="gallery">
          {image && (
            <img
              className="gallery-main"
              src={image.url}
              width={image.width}
              height={image.height}
              alt={`${product.name} in ${article.colorName}, ${image.kind} view`}
            />
          )}
          <div className="gallery-thumbs">
            {article.images.map((thumb, index) => (
              <button
                key={thumb.url}
                type="button"
                aria-label={`Show ${thumb.kind} image`}
                aria-pressed={index === imageIndex}
                onClick={() => setImageIndex(index)}
              >
                <img src={thumb.url} width={80} height={110} alt="" />
              </button>
            ))}
          </div>
        </div>

        <div className="product-info">
          <p className="article-brand">{product.brand.name}</p>
          <h1>{product.name}</h1>
          <p className="price large">
            <span className={price.originalCents === null ? undefined : 'price-sale'}>
              {formatPrice(price.currentCents)}
            </span>
            {price.originalCents !== null && (
              <>
                <s>{formatPrice(price.originalCents)}</s>
                <span className="badge inline">-{price.discountPct}%</span>
              </>
            )}
          </p>

          <fieldset>
            <legend>
              Colour: <strong>{article.colorName}</strong>
            </legend>
            <div className="swatches">
              {product.articles.map((colour) => (
                <Link
                  key={colour.sku}
                  to={`/p/${encodeURIComponent(colour.sku)}`}
                  replace
                  className="swatch"
                  style={{ background: swatchColors[colour.colorFamily] }}
                  aria-label={colour.colorName}
                  aria-current={colour.sku === article.sku ? 'true' : undefined}
                />
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Size</legend>
            <div className="chips">
              {article.sizes.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className="chip"
                  disabled={option.availability === 'out_of_stock'}
                  aria-pressed={size === option.label}
                  onClick={() => setSize(option.label)}
                >
                  {option.label}
                  {option.availability === 'low_stock' && <span className="hint"> · Few left</span>}
                </button>
              ))}
            </div>
          </fieldset>

          <button className="button primary" type="button" disabled>
            {size === null ? 'Select a size' : 'Add to bag'}
          </button>
          <p className="hint">Bag and checkout aren't part of this demo.</p>

          <p className="description">{product.description}</p>
          <dl className="details">
            {details
              .filter((detail): detail is [string, string] => detail[1] !== null)
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
        </div>
      </div>
    </article>
  );
}

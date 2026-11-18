import { Link } from 'react-router';
import type { ArticleTile } from '../api/catalog';
import { formatPrice } from '../lib/money';

export function ArticleCard({ article }: { article: ArticleTile }) {
  const { price } = article;
  return (
    <li className="article-card">
      <Link to={`/p/${encodeURIComponent(article.sku)}`}>
        <div className="article-image">
          {article.image && (
            <img
              src={article.image.url}
              width={article.image.width}
              height={article.image.height}
              loading="lazy"
              alt={`${article.productName} in ${article.colorName}`}
            />
          )}
          {price.discountPct > 0 && <span className="badge">-{price.discountPct}%</span>}
        </div>
        <p className="article-brand">{article.brand.name}</p>
        <p className="article-name">{article.productName}</p>
        <p className="price">
          <span className={price.originalCents === null ? undefined : 'price-sale'}>
            {formatPrice(price.currentCents)}
          </span>
          {price.originalCents !== null && <s>{formatPrice(price.originalCents)}</s>}
        </p>
      </Link>
    </li>
  );
}

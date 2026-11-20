// Prints EXPLAIN (ANALYZE, BUFFERS) for the listing queries the API runs, as Markdown:
//   DATABASE_URL=... pnpm explain > ../docs/query-plans.md
// A one-line summary per query goes to stderr.
import { buildArticleListSql, createPool, findCategoryLeafIds, listArticles } from '@celestiea/db';
import { parseArticleListQuery, type ArticleListInput } from '@celestiea/domain';

const pool = createPool({ connectionString: process.env.DATABASE_URL });

async function cursorAfter(input: ArticleListInput, rows: number): Promise<string> {
  let after: string | null = null;
  for (let fetched = 0; fetched < rows; fetched += 96) {
    const page = await listArticles(pool, parseArticleListQuery({ ...input, first: 96, after }));
    after = page.endCursor;
  }
  return after ?? '';
}

const deepInput: ArticleListInput = { filter: { category: 'women' }, sort: 'popular' };
const cases: [title: string, input: ArticleListInput][] = [
  ['Whole catalog, popular (home page)', {}],
  ['Leaf category, popular', { filter: { category: 'women-clothing-dresses-maxi' } }],
  ['Mid-level category, popular', { filter: { category: 'women-clothing-dresses' } }],
  ['Top-level category, popular', { filter: { category: 'women' } }],
  [
    'Leaf category with price range, price ascending',
    {
      filter: {
        category: 'women-clothing-jeans-straight',
        minPriceCents: 4000,
        maxPriceCents: 8000,
      },
      sort: 'price_asc',
    },
  ],
  [
    'Leaf category, brand + colour + size + sale',
    {
      filter: {
        category: 'men-shoes-trainers-low-top',
        brands: ['nordvik-studio', 'calder-supply', 'mirren-line'],
        colors: ['black', 'white'],
        sizes: ['EU 42'],
        onSale: true,
      },
    },
  ],
  ['Whole catalog, newest', { sort: 'newest' }],
  ['Whole catalog, biggest discount', { sort: 'discount' }],
  [
    'Top-level category, page 41 (after 3,840 rows)',
    { ...deepInput, after: await cursorAfter(deepInput, 3840) },
  ],
];

const out: string[] = [];
for (const [title, input] of cases) {
  const query = parseArticleListQuery(input);
  const sql = await buildArticleListSql(pool, query);
  if (sql === null) {
    throw new Error(`${title}: the category does not exist`);
  }
  // Warm the buffer cache once so the plans show steady-state timings.
  await pool.query(sql.text, sql.values);
  const { rows } = await pool.query<{ 'QUERY PLAN': string }>(
    `EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) ${sql.text}`,
    sql.values,
  );
  const plan = rows.map((row) => row['QUERY PLAN']).join('\n');
  const indexes = [
    ...new Set(
      [
        ...plan.matchAll(
          /(?:Index(?: Only)? Scan(?: Backward)? using|Bitmap Index Scan on) (\w+)/g,
        ),
      ].map((match) => match[1]),
    ),
  ];
  const time = /Execution Time: ([\d.]+) ms/.exec(plan)?.[1] ?? '?';
  process.stderr.write(
    `${time.padStart(8)} ms  ${title}  [${indexes.join(', ')}]${plan.includes('Sort') ? ' SORT' : ''}\n`,
  );

  const filter = { ...input, after: input.after ? '(cursor)' : undefined };
  out.push(`### ${title}\n\n\`${JSON.stringify(filter)}\`\n\n\`\`\`text\n${plan}\n\`\`\`\n`);
}

const leafCount = (await findCategoryLeafIds(pool, 'women')).length;
const { rows: counts } = await pool.query<{ articles: number; listed: number }>(
  `SELECT count(*) AS articles,
          count(*) FILTER (WHERE deleted_at IS NULL AND status = 'active' AND product_status = 'active') AS listed
     FROM articles`,
);
process.stdout.write(
  [
    `Dataset: ${counts[0]?.articles} articles, ${counts[0]?.listed} listed; "women" expands to ${leafCount} leaf categories.`,
    '',
    ...out,
  ].join('\n'),
);
await pool.end();

import {
  ArticleCreateInput,
  ArticlePatchInput,
  DomainError,
  parseInput,
  parseProductId,
  ProductCreateInput,
  ProductPatchInput,
  SizeAvailabilityInput,
} from '@celestiea/domain';
import {
  addArticle,
  assertVersion,
  createProductAggregate,
  findArticleForWrite,
  findProductIdBySku,
  findProductView,
  lockProduct,
  setSizeAvailability,
  softDeleteArticle,
  softDeleteProduct,
  updateArticle,
  updateProduct,
} from '@celestiea/db';
import {
  parseIfMatch,
  parseJsonBody,
  productResponse,
  type WriteContext,
  type WriteRequest,
  type WriteResponse,
} from './http';
import { runWrite, viewAfterWrite } from './run-write';

export type Handler = (request: WriteRequest, context: WriteContext) => Promise<WriteResponse>;

export const createProduct: Handler = (request, context) => {
  const input = parseInput(ProductCreateInput, parseJsonBody(request));
  return runWrite(
    request,
    context,
    async (client) => {
      const productId = await createProductAggregate(client, input);
      return { status: 201, view: await viewAfterWrite(client, productId) };
    },
    (view) => `/v1/products/${view.id}`,
  );
};

export const patchProduct: Handler = (request, context) => {
  const productId = parseProductId(request.params.id ?? '');
  const input = parseInput(ProductPatchInput, parseJsonBody(request));
  const expectedVersion = parseIfMatch(request, { required: true });
  return runWrite(request, context, async (client) => {
    const product = await lockProduct(client, productId);
    assertVersion(product, expectedVersion);
    await updateProduct(client, product, input);
    return { status: 200, view: await viewAfterWrite(client, productId) };
  });
};

export const deleteProduct: Handler = (request, context) => {
  const productId = parseProductId(request.params.id ?? '');
  const expectedVersion = parseIfMatch(request, { required: false });
  return runWrite(request, context, async (client) => {
    const product = await lockProduct(client, productId);
    assertVersion(product, expectedVersion);
    await softDeleteProduct(client, productId);
    return { status: 204, deletedProductId: productId };
  });
};

export const createArticle: Handler = (request, context) => {
  const productId = parseProductId(request.params.id ?? '');
  const input = parseInput(ArticleCreateInput, parseJsonBody(request));
  const expectedVersion = parseIfMatch(request, { required: false });
  return runWrite(
    request,
    context,
    async (client) => {
      const product = await lockProduct(client, productId);
      assertVersion(product, expectedVersion);
      await addArticle(client, product, input);
      return { status: 201, view: await viewAfterWrite(client, productId) };
    },
    () => `/v1/articles/${encodeURIComponent(input.articleSku)}`,
  );
};

export const patchArticle: Handler = (request, context) => {
  const input = parseInput(ArticlePatchInput, parseJsonBody(request));
  const expectedVersion = parseIfMatch(request, { required: false });
  return runWrite(request, context, async (client) => {
    const { articleId, productId } = await findArticleForWrite(client, request.params.sku ?? '');
    assertVersion(await lockProduct(client, productId), expectedVersion);
    await updateArticle(client, articleId, productId, input);
    return { status: 200, view: await viewAfterWrite(client, productId) };
  });
};

export const deleteArticle: Handler = (request, context) => {
  const expectedVersion = parseIfMatch(request, { required: false });
  return runWrite(request, context, async (client) => {
    const { articleId, productId } = await findArticleForWrite(client, request.params.sku ?? '');
    assertVersion(await lockProduct(client, productId), expectedVersion);
    await softDeleteArticle(client, articleId, productId);
    return { status: 200, view: await viewAfterWrite(client, productId) };
  });
};

export const patchSizeAvailability: Handler = (request, context) => {
  const input = parseInput(SizeAvailabilityInput, parseJsonBody(request));
  const expectedVersion = parseIfMatch(request, { required: false });
  return runWrite(request, context, async (client) => {
    const { articleId, productId } = await findArticleForWrite(client, request.params.sku ?? '');
    assertVersion(await lockProduct(client, productId), expectedVersion);
    const sizeLabel = request.params.sizeLabel ?? '';
    await setSizeAvailability(client, articleId, productId, sizeLabel, input.availability);
    return { status: 200, view: await viewAfterWrite(client, productId) };
  });
};

// Admin lookup by model or article SKU. It lives on the write side because it must see
// drafts and read the writer, so an admin sees their own edits immediately.
export const findProductForAdmin: Handler = async (request, context) => {
  const sku = request.query.get('sku') ?? '';
  const productId = await findProductIdBySku(context.pool, sku);
  const view = productId === null ? null : await findProductView(context.pool, productId);
  if (view === null) {
    throw new DomainError('not_found', `No product with SKU "${sku}".`);
  }
  return productResponse(200, view);
};

/**
 * productService.server.ts
 *
 * Handles all product-related data operations:
 * - Fetching products from Shopify via GraphQL
 * - Syncing products to the local DB
 * - Updating product SEO fields on Shopify
 * - Re-scoring products
 */

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { prisma } from "~/db.server";
import { scoreProduct } from "~/services/seoService.server";

// ─── GraphQL Queries / Mutations ─────────────────────────────────────────────

const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        status
        updatedAt
        descriptionHtml
        description
        seo {
          title
          description
        }
      }
    }
  }
`;

const PRODUCT_UPDATE_MUTATION = `
  mutation UpdateProductSEO($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        seo {
          title
          description
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShopifyProduct {
    id: string;
    title: string;
    handle: string;
    status: string;
    updatedAt: string;
    descriptionHtml: string | null;
    description: string | null;
    seo: {
        title: string | null;
        description: string | null;
    } | null;
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export async function syncProducts(admin: AdminApiContext, shop: string) {
    const allProducts: ShopifyProduct[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;
    let fetched = 0;
    const PAGE_SIZE = 50;

    console.log(`[Sync] Starting product sync for ${shop}`);

    try {
        while (hasNextPage && fetched < 2500) { // Increased safety limit for "Lite" to 2500
            const response = await admin.graphql(PRODUCTS_QUERY, {
                variables: { first: PAGE_SIZE, after: cursor },
            });

            const data = await response.json();

            if (data.errors) {
                console.error(`[Sync] GraphQL errors:`, JSON.stringify(data.errors));
                throw new Error(`Shopify API error: ${data.errors[0].message}`);
            }

            const products: ShopifyProduct[] = data.data.products.nodes;
            const pageInfo = data.data.products.pageInfo;

            allProducts.push(...products);
            fetched += products.length;
            hasNextPage = pageInfo.hasNextPage;
            cursor = pageInfo.endCursor;
        }

        for (const p of allProducts) {
            // "Import" logic: If SEO fields are null in Shopify, we store the fallback in our DB
            const importedSeoTitle = p.seo?.title || p.title;
            const importedSeoDescription = p.seo?.description || p.description || "";

            const { score, issues } = scoreProduct({
                title: p.title,
                seoTitle: importedSeoTitle,
                seoDescription: importedSeoDescription,
            });

            await prisma.product.upsert({
                where: { id: p.id },
                update: {
                    shopDomain: shop,
                    title: p.title,
                    handle: p.handle,
                    seoTitle: importedSeoTitle,
                    seoDescription: importedSeoDescription,
                    descriptionHtml: p.descriptionHtml || "",
                    status: p.status,
                    seoScore: score,
                    seoIssues: JSON.stringify(issues),
                    shopifyUpdatedAt: p.updatedAt,
                    lastScoredAt: new Date(),
                },
                create: {
                    id: p.id,
                    shopDomain: shop,
                    title: p.title,
                    handle: p.handle,
                    seoTitle: importedSeoTitle,
                    seoDescription: importedSeoDescription,
                    descriptionHtml: p.descriptionHtml || "",
                    status: p.status,
                    seoScore: score,
                    seoIssues: JSON.stringify(issues),
                    shopifyUpdatedAt: p.updatedAt,
                    lastScoredAt: new Date(),
                },
            });
        }

        return allProducts.length;
    } catch (err) {
        console.error(`[Sync] error:`, err);
        throw err;
    }
}

// ─── Re-score a single product ────────────────────────────────────────────────

export async function rescoreProduct(
    admin: AdminApiContext,
    productId: string,
    shop: string,
    webhookUpdatedAt?: string
) {
    const SINGLE_PRODUCT_QUERY = `
    query GetProduct($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        status
        updatedAt
        descriptionHtml
        description
        seo {
          title
          description
        }
      }
    }
  `;

    try {
        const response = await admin.graphql(SINGLE_PRODUCT_QUERY, {
            variables: { id: productId },
        });
        const data = await response.json();
        const p: ShopifyProduct = data.data?.product;
        if (!p) throw new Error("Product not found");

        // "Import" logic: Use defaults if SEO is null
        const importedSeoTitle = p.seo?.title || p.title;
        const importedSeoDescription = p.seo?.description || p.description || "";

        const { score, issues } = scoreProduct({
            title: p.title,
            seoTitle: importedSeoTitle,
            seoDescription: importedSeoDescription,
        });

        const updated = await prisma.product.upsert({
            where: { id: p.id },
            update: {
                shopDomain: shop,
                title: p.title,
                handle: p.handle,
                seoTitle: importedSeoTitle,
                seoDescription: importedSeoDescription,
                descriptionHtml: p.descriptionHtml || "",
                status: p.status,
                seoScore: score,
                seoIssues: JSON.stringify(issues),
                shopifyUpdatedAt: p.updatedAt,
                lastScoredAt: new Date(),
            },
            create: {
                id: p.id,
                shopDomain: shop,
                title: p.title,
                handle: p.handle,
                seoTitle: importedSeoTitle,
                seoDescription: importedSeoDescription,
                descriptionHtml: p.descriptionHtml || "",
                status: p.status,
                seoScore: score,
                seoIssues: JSON.stringify(issues),
                shopifyUpdatedAt: p.updatedAt,
                lastScoredAt: new Date(),
            },
        });

        return updated;
    } catch (err) {
        console.error(`[Rescore] error:`, err);
        throw err;
    }
}

// ─── Update SEO fields on Shopify ─────────────────────────────────────────────

export async function updateProductSEO(
    admin: AdminApiContext,
    productId: string,
    shop: string,
    seoTitle: string,
    seoDescription: string
) {
    const response = await admin.graphql(PRODUCT_UPDATE_MUTATION, {
        variables: {
            input: {
                id: productId,
                seo: {
                    title: seoTitle,
                    description: seoDescription,
                },
            },
        },
    });

    const data = await response.json();
    if (data.data?.productUpdate?.userErrors?.length > 0) {
        throw new Error(data.data.productUpdate.userErrors[0].message);
    }

    return await rescoreProduct(admin, productId, shop);
}

// ─── Bulk re-score (DB only) ───────────────────────────

export async function bulkRescoreAllProducts(shop: string) {
    const products = await prisma.product.findMany({ where: { shopDomain: shop } });

    for (const p of products) {
        const { score, issues } = scoreProduct({
            title: p.title || "",
            seoTitle: p.seoTitle,
            seoDescription: p.seoDescription,
        });
        await prisma.product.update({
            where: { id: p.id },
            data: {
                seoScore: score,
                seoIssues: JSON.stringify(issues),
                lastScoredAt: new Date(),
            },
        });
    }

    return products.length;
}

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { rescoreProduct } from "~/services/productService.server";

/**
 * POST /webhooks/products/update
 *
 * Handles the products/update Shopify webhook.
 * HMAC verification is performed automatically by the Shopify SDK.
 * Idempotency is enforced via the shopifyUpdatedAt field in the DB.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
    const { topic, shop, session, payload, admin } =
        await authenticate.webhook(request);

    if (topic !== "PRODUCTS_UPDATE") {
        // Not our concern
        return new Response(null, { status: 200 });
    }

    if (!admin) {
        // Offline access needed — webhook triggers might not have admin on first fire
        console.error("[webhook] No admin session for shop:", shop);
        return new Response("Unauthorized", { status: 401 });
    }

    const productGid = `gid://shopify/Product/${payload.id}`;
    const updatedAt: string = payload.updated_at;

    console.log(`[webhook] PRODUCTS_UPDATE received for ${productGid} @ ${updatedAt}`);

    try {
        const processed = await rescoreProduct(admin, productGid, shop, updatedAt);
        if (processed) {
            console.log(`[webhook] Re-scored product ${productGid}`);
        } else {
            console.log(`[webhook] Skipped duplicate update for ${productGid}`);
        }
    } catch (err) {
        console.error("[webhook] Error rescoring product:", err);
        // Return 200 anyway to prevent Shopify from retrying (we'll log the error)
    }

    return new Response(null, { status: 200 });
};

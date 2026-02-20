import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { shop, session } = await authenticate.webhook(request);
    console.log(`[webhook] APP_UNINSTALLED for shop: ${shop}`);

    // Clean up app data for this shop
    if (session) {
        await prisma.session.deleteMany({ where: { shop } });
        await prisma.product.deleteMany({ where: { shopDomain: shop } });
    }

    return new Response(null, { status: 200 });
};

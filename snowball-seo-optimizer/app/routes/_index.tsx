import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

/**
 * Root index route.
 * Redirects any requests to the base URL (/) to the authenticated dashboard (/app),
 * while preserving important Shopify query parameters (shop, host, hmac, session).
 */
export async function loader({ request }: LoaderFunctionArgs) {
    const url = new URL(request.url);

    // If we're at the root, redirect to /app with all query parameters preserved
    if (url.pathname === "/" || url.pathname === "") {
        return redirect(`/app${url.search}`);
    }

    return null;
}

export default function Index() {
    return null;
}

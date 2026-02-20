import { Outlet, useLoaderData } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
    await authenticate.admin(request);
    return { apiKey: process.env.SHOPIFY_API_KEY || "" };
}

export default function AppLayout() {
    const { apiKey } = useLoaderData<typeof loader>();

    return (
        <AppProvider apiKey={apiKey}>
            <Outlet />
        </AppProvider>
    );
}
// Required for Shopify App Bridge
export function headers() {
    return {
        "Content-Security-Policy": "frame-ancestors https://*.myshopify.com https://admin.shopify.com;",
    };
}

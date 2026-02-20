import type { LoaderFunctionArgs } from "react-router";
import { login } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    if (url.searchParams.get("shop")) {
        throw await login(request);
    }
    return null;
};

export default function Auth() {
    return (
        <div style={{ padding: "20px" }}>
            <h1>Shopify Login</h1>
            <form method="get">
                <label>
                    Shop domain:
                    <input type="text" name="shop" placeholder="your-store.myshopify.com" />
                </label>
                <button type="submit">Login</button>
            </form>
        </div>
    );
}

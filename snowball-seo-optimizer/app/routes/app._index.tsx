import {
    Page,
    Layout,
    Card,
    Text,
    Button,
    DataTable,
    Badge,
    Modal,
    TextField,
    InlineStack,
    BlockStack,
    Banner,
    Spinner,
    EmptyState,
    Link,
    Pagination,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, data, useSearchParams } from "react-router";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/db.server";
import {
    syncProducts,
    bulkRescoreAllProducts,
    updateProductSEO,
} from "~/services/productService.server";

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const url = new URL(request.url);

    // Pagination params
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const pageSize = Math.max(1, parseInt(url.searchParams.get("pageSize") || "20"));
    const skip = (page - 1) * pageSize;

    // Search & Filter params
    const q = url.searchParams.get("q") || "";
    const sort = url.searchParams.get("sort") || "score_asc";
    const lowScoreOnly = url.searchParams.get("lowScore") === "true";

    const where: any = { shopDomain: shop };
    if (q) {
        where.title = { contains: q };
    }
    if (lowScoreOnly) {
        where.seoScore = { lt: 60 };
    }

    const orderBy: any = {};
    if (sort === "score_asc") orderBy.seoScore = "asc";
    if (sort === "score_desc") orderBy.seoScore = "desc";
    if (sort === "title_asc") orderBy.title = "asc";
    if (sort === "title_desc") orderBy.title = "desc";

    const [products, totalFiltered, globalStats] = await Promise.all([
        prisma.product.findMany({
            where,
            orderBy,
            skip,
            take: pageSize,
        }),
        prisma.product.count({ where }),
        prisma.product.aggregate({
            where: { shopDomain: shop },
            _avg: { seoScore: true },
            _count: { id: true }
        })
    ]);

    const [missingMetaCount, lowScoreTotalCount] = await Promise.all([
        prisma.product.count({
            where: {
                shopDomain: shop,
                seoIssues: { contains: "Meta Missing" }
            }
        }),
        prisma.product.count({
            where: {
                shopDomain: shop,
                seoScore: { lt: 60 }
            }
        })
    ]);

    return {
        products: products.map((p) => ({
            ...p,
            seoIssues: JSON.parse(p.seoIssues || "[]") as string[],
        })),
        shop,
        stats: {
            totalProducts: globalStats._count.id,
            avgScore: Math.round(globalStats._avg.seoScore || 0),
            missingMeta: missingMetaCount,
            lowScore: lowScoreTotalCount
        },
        pagination: {
            page,
            pageSize,
            totalCount: totalFiltered,
            totalPages: Math.ceil(totalFiltered / pageSize),
        },
        filters: { q, sort, lowScoreOnly }
    };
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const actionType = formData.get("action");

    console.log(`[Dashboard Action] ${actionType} for ${shop}`);

    if (actionType === "sync") {
        try {
            const count = await syncProducts(admin, shop);
            return data({ success: true, count });
        } catch (err: any) {
            console.error(`[Dashboard Action] Sync error:`, err);
            return data({ error: err.message || "Sync failed" }, { status: 500 });
        }
    }

    if (actionType === "bulk-rescore") {
        const count = await bulkRescoreAllProducts(shop);
        return data({ success: true, count });
    }

    if (actionType === "update") {
        const id = String(formData.get("id"));
        const seoTitle = String(formData.get("seoTitle"));
        const seoDescription = String(formData.get("seoDescription"));

        try {
            const updated = await updateProductSEO(
                admin,
                id,
                shop,
                seoTitle,
                seoDescription
            );
            return data({
                success: true,
                product: {
                    ...updated,
                    seoIssues: JSON.parse(updated.seoIssues || "[]") as string[],
                },
            });
        } catch (err: any) {
            console.error(`[Dashboard Action] Update error:`, err);
            return data({ error: err.message || "Update failed" }, { status: 500 });
        }
    }

    return data({ error: "Unknown action" }, { status: 400 });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
    id: string;
    title: string;
    handle: string;
    seoTitle: string | null;
    seoDescription: string | null;
    seoScore: number;
    seoIssues: string[];
    status: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreBadge(score: number) {
    if (score >= 80) return <Badge tone="success">{String(score)}</Badge>;
    if (score >= 60) return <Badge tone="attention">{String(score)}</Badge>;
    return <Badge tone="critical">{String(score)}</Badge>;
}

const ISSUE_TONES: Record<string, "critical" | "warning" | "attention" | "info"> = {
    "Meta Missing": "critical",
    "Title Missing": "critical",
    "Meta Too Short": "attention",
    "Meta Too Long": "attention",
    "Title Too Short": "attention",
    "Title Too Long": "attention",
    "Keyword Missing": "info",
};

function issueBadges(issues: string[]) {
    return (
        <InlineStack gap="100" wrap={true}>
            {issues.length === 0 ? (
                <Badge tone="success">✓ All Good</Badge>
            ) : (
                issues.map((issue) => (
                    <Badge key={issue} tone={ISSUE_TONES[issue] || "attention"}>
                        {issue}
                    </Badge>
                ))
            )}
        </InlineStack>
    );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
    const {
        products: initialProducts,
        shop,
        stats,
        pagination,
        filters
    } = useLoaderData<typeof loader>();
    const [products, setProducts] = useState<Product[]>(initialProducts);
    const [searchParams, setSearchParams] = useSearchParams();

    const fetcher = useFetcher<{ success: boolean; count?: number; product?: Product; error?: string }>();

    // Local UI state for modal
    const [editProduct, setEditProduct] = useState<Product | null>(null);
    const [seoTitle, setSeoTitle] = useState("");
    const [seoDescription, setSeoDescription] = useState("");

    const isSyncing = fetcher.state !== "idle" && fetcher.formData?.get("action") === "sync";
    const isBulkRescoring = fetcher.state !== "idle" && fetcher.formData?.get("action") === "bulk-rescore";
    const isSaving = fetcher.state !== "idle" && fetcher.formData?.get("action") === "update";

    // Handle fetcher results
    useEffect(() => {
        if (fetcher.state === "idle" && fetcher.data?.success) {
            // If it was an update, update local state
            if (fetcher.data.product) {
                const updatedProduct = fetcher.data.product;
                setProducts((prev) =>
                    prev.map((p) =>
                        p.id === updatedProduct.id
                            ? updatedProduct
                            : p
                    )
                );
                setEditProduct(null);
            } else {
                // For sync or bulk rescore, refresh the page data
                window.location.reload();
            }
        }
    }, [fetcher.state, fetcher.data]);

    useEffect(() => {
        setProducts(initialProducts);
    }, [initialProducts]);

    const openEdit = useCallback((product: Product) => {
        setEditProduct(product);
        setSeoTitle(product.seoTitle || "");
        setSeoDescription(product.seoDescription || "");
    }, []);

    const handleSave = useCallback(() => {
        if (!editProduct) return;
        fetcher.submit(
            { action: "update", id: editProduct.id, seoTitle, seoDescription },
            { method: "POST" }
        );
    }, [editProduct, seoTitle, seoDescription, fetcher]);

    const handleSync = useCallback(() => {
        fetcher.submit({ action: "sync" }, { method: "POST" });
    }, [fetcher]);

    const handleBulkRescore = useCallback(() => {
        fetcher.submit({ action: "bulk-rescore" }, { method: "POST" });
    }, [fetcher]);

    // URL state handlers
    const updateQuery = useCallback((params: Record<string, string | null>) => {
        const newParams = new URLSearchParams(searchParams);
        Object.entries(params).forEach(([key, value]) => {
            if (value === null) newParams.delete(key);
            else newParams.set(key, value);
        });
        // Always reset to page 1 on filter change
        if (!params.page) newParams.set("page", "1");
        setSearchParams(newParams);
    }, [searchParams, setSearchParams]);

    const handleSearchChange = useCallback((value: string) => {
        updateQuery({ q: value || null });
    }, [updateQuery]);

    const handleSortChange = useCallback(() => {
        const currentSort = filters.sort;
        const nextSort = currentSort === "score_asc" ? "score_desc" : "score_asc";
        updateQuery({ sort: nextSort });
    }, [filters.sort, updateQuery]);

    const toggleLowScore = useCallback(() => {
        updateQuery({ lowScore: !filters.lowScoreOnly ? "true" : null });
    }, [filters.lowScoreOnly, updateQuery]);

    // Derived statistics (now from loader)
    const { totalProducts, avgScore, missingMeta, lowScore } = stats;

    const displayed = products; // Already sorted/filtered by server

    // DataTable rows
    const rows = displayed.map((p: Product) => {
        const numericId = p.id.split("/").pop();
        const adminUrl = `https://${shop}/admin/products/${numericId}`;

        return [
            <Link
                key="title-link"
                url={adminUrl}
                target="_blank"
                removeUnderline
            >
                <Text as="span" fontWeight="semibold">{p.title}</Text>
            </Link>,
            <div key="score">{scoreBadge(p.seoScore)}</div>,
            <div key="issues">{issueBadges(p.seoIssues)}</div>,
            <Button size="slim" onClick={() => openEdit(p)} key="edit">
                Edit
            </Button>,
        ];
    });

    return (
        <Page
            title="SEO Meta Optimizer"
            subtitle="Analyze and optimize SEO for your Shopify products"
            primaryAction={{
                content: isSyncing ? "Syncing…" : "Sync Products",
                onAction: handleSync,
                loading: isSyncing,
            }}
            secondaryActions={[
                {
                    content: isBulkRescoring ? "Re-scoring…" : "Bulk Re-score",
                    onAction: handleBulkRescore,
                    loading: isBulkRescoring,
                },
            ]}
        >
            <Layout>
                <Layout.Section>
                    <InlineStack gap="400" wrap={false}>
                        <Card>
                            <BlockStack gap="200">
                                <Text as="p" tone="subdued" variant="bodyMd">
                                    Total Analyzed
                                </Text>
                                <Text as="p" variant="headingXl">
                                    {totalProducts}
                                </Text>
                            </BlockStack>
                        </Card>

                        <Card>
                            <BlockStack gap="200">
                                <Text as="p" tone="subdued" variant="bodyMd">
                                    Avg SEO Score
                                </Text>
                                <Text
                                    as="p"
                                    variant="headingXl"
                                    tone={avgScore >= 80 ? "success" : avgScore >= 60 ? "caution" : "critical"}
                                >
                                    {totalProducts ? String(avgScore) : "–"}
                                </Text>
                            </BlockStack>
                        </Card>

                        <Card>
                            <BlockStack gap="200">
                                <Text as="p" tone="subdued" variant="bodyMd">
                                    Missing Meta
                                </Text>
                                <Text as="p" variant="headingXl" tone={missingMeta > 0 ? "critical" : "success"}>
                                    {String(missingMeta)}
                                </Text>
                            </BlockStack>
                        </Card>

                        <Card>
                            <BlockStack gap="200">
                                <Text as="p" tone="subdued" variant="bodyMd">
                                    Score &lt; 60
                                </Text>
                                <Text as="p" variant="headingXl" tone={lowScore > 0 ? "critical" : "success"}>
                                    {String(lowScore)}
                                </Text>
                            </BlockStack>
                        </Card>
                    </InlineStack>
                </Layout.Section>

                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <InlineStack gap="400" align="space-between">
                                <div style={{ flex: 1, maxWidth: 360 }}>
                                    <TextField
                                        label="Search products"
                                        labelHidden
                                        placeholder="Search by title…"
                                        value={filters.q}
                                        onChange={handleSearchChange}
                                        clearButton
                                        onClearButtonClick={() => handleSearchChange("")}
                                        autoComplete="off"
                                    />
                                </div>
                                <InlineStack gap="200">
                                    <Button
                                        variant={filters.lowScoreOnly ? "primary" : "secondary"}
                                        size="slim"
                                        onClick={toggleLowScore}
                                    >
                                        {filters.lowScoreOnly ? "Show All" : "Score < 60"}
                                    </Button>
                                    <Button
                                        size="slim"
                                        onClick={handleSortChange}
                                    >
                                        Sort Score {filters.sort === "score_asc" ? "↑" : "↓"}
                                    </Button>
                                </InlineStack>
                            </InlineStack>

                            {isSyncing ? (
                                <div style={{ padding: "40px", textAlign: "center" }}>
                                    <Spinner size="large" />
                                    <Text as="p" tone="subdued">
                                        Syncing products from Shopify…
                                    </Text>
                                </div>
                            ) : products.length === 0 ? (
                                <EmptyState
                                    heading="No products synced yet"
                                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                                    action={{ content: "Sync Products", onAction: handleSync }}
                                >
                                    <p>Click "Sync Products" to pull your products from Shopify.</p>
                                </EmptyState>
                            ) : (
                                <BlockStack gap="400">
                                    <DataTable
                                        columnContentTypes={["text", "text", "text", "text"]}
                                        headings={["Product Title", "SEO Score", "Issues", "Action"]}
                                        rows={rows}
                                        footerContent={`Showing results ${((pagination.page - 1) * pagination.pageSize) + 1}–${Math.min(pagination.page * pagination.pageSize, pagination.totalCount)} of ${pagination.totalCount}`}
                                    />
                                    {pagination.totalPages > 1 && (
                                        <InlineStack align="center">
                                            <Pagination
                                                hasPrevious={pagination.page > 1}
                                                onPrevious={() => updateQuery({ page: String(pagination.page - 1) })}
                                                hasNext={pagination.page < pagination.totalPages}
                                                onNext={() => updateQuery({ page: String(pagination.page + 1) })}
                                                label={`Page ${pagination.page} of ${pagination.totalPages}`}
                                            />
                                        </InlineStack>
                                    )}
                                </BlockStack>
                            )}
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>

            <Modal
                open={!!editProduct}
                onClose={() => setEditProduct(null)}
                title={`Edit SEO — ${editProduct?.title}`}
                primaryAction={{
                    content: isSaving ? "Saving…" : "Save",
                    onAction: handleSave,
                    loading: isSaving,
                }}
                secondaryActions={[
                    { content: "Cancel", onAction: () => setEditProduct(null) },
                ]}
            >
                <Modal.Section>
                    <BlockStack gap="400">
                        {fetcher.data?.error && (
                            <Banner tone="critical">
                                <p>{fetcher.data.error}</p>
                            </Banner>
                        )}

                        <TextField
                            label="SEO Title"
                            value={seoTitle}
                            onChange={setSeoTitle}
                            autoComplete="off"
                            helpText={`${seoTitle.length}/60 characters · Optimal: 30–60. Leave empty to use product title.`}
                            error={
                                seoTitle.length > 60
                                    ? "Title is too long"
                                    : seoTitle.length > 0 && seoTitle.length < 30
                                        ? "Title is too short"
                                        : undefined
                            }
                            showCharacterCount
                            maxLength={70}
                        />

                        <TextField
                            label="Meta Description"
                            value={seoDescription}
                            onChange={setSeoDescription}
                            autoComplete="off"
                            multiline={3}
                            helpText={`${seoDescription.length}/160 characters · Minimum: 120. Leave empty to use product description.`}
                            error={
                                seoDescription.length > 0 && seoDescription.length < 120
                                    ? "Description is too short (minimum 120 characters)"
                                    : seoDescription.length > 160
                                        ? "Description is too long (maximum 160 characters)"
                                        : undefined
                            }
                            maxLength={170}
                        />

                        {editProduct && (
                            <Banner tone="info">
                                <p>
                                    <strong>Primary keyword:</strong>{" "}
                                    {(editProduct.title || "")
                                        .toLowerCase()
                                        .split(/\s+/)
                                        .slice(0, 3)
                                        .join(" ")}
                                </p>
                            </Banner>
                        )}
                    </BlockStack>
                </Modal.Section>
            </Modal>
        </Page>
    );
}

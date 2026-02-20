import { Page, Layout, Card, Text, BlockStack } from "@shopify/polaris";

export default function ErrorPage({ error }: { error: any }) {
    return (
        <Page title="Error">
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">
                                Something went wrong
                            </Text>
                            <Text as="p" tone="critical">
                                {error?.message || "An unexpected error occurred."}
                            </Text>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}

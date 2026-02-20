/**
 * seoService.server.ts
 *
 * Pure SEO scoring logic — no DB or Shopify dependencies.
 * All rules are self-contained and easily unit-testable.
 */

export interface SeoInput {
    title: string | null | undefined;
    seoTitle: string | null | undefined;
    seoDescription: string | null | undefined;
}

export interface SeoResult {
    score: number;
    issues: string[];
}

/**
 * The "effective" title for SEO is the seoTitle if set, otherwise the product title.
 */
function effectiveTitle(input: SeoInput): string {
    return (input.seoTitle || input.title || "").trim();
}

/**
 * Primary keyword = first 2-3 words of the effective title (lowercased).
 */
function primaryKeyword(title: string): string {
    const words = title.toLowerCase().split(/\s+/).filter(Boolean);
    return words.slice(0, Math.min(3, words.length)).join(" ");
}

export function scoreProduct(input: SeoInput): SeoResult {
    const issues: string[] = [];
    let score = 100;

    const title = effectiveTitle(input);
    const metaDesc = (input.seoDescription || "").trim();

    // --- Title checks ---
    if (title.length === 0) {
        issues.push("Title Missing");
        score -= 50;
    } else {
        if (title.length < 30) {
            issues.push("Title Too Short");
            score -= 10;
        } else if (title.length > 60) {
            issues.push("Title Too Long");
            score -= 10;
        }
    }

    // --- Meta description checks ---
    if (!metaDesc) {
        issues.push("Meta Missing");
        score -= 40;
    } else {
        if (metaDesc.length < 120) {
            issues.push("Meta Too Short");
            score -= 20;
        } else if (metaDesc.length > 160) {
            issues.push("Meta Too Long");
            score -= 10;
        }

        // Primary keyword check (only if we have a title)
        if (title.length > 0) {
            const keyword = primaryKeyword(title);
            if (keyword && !metaDesc.toLowerCase().includes(keyword)) {
                issues.push("Keyword Missing");
                score -= 10;
            }
        }
    }

    return { score: Math.max(0, score), issues };
}

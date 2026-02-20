

# **Shopify App Assignment – SEO Meta Optimizer**

**Time expectation:** 4–8 hours

**Submission:** GitHub repo \+ 5–10 min Loom walkthrough

---

## **Objective**

Build a simple embedded Shopify app:

**SEO Meta Optimizer Lite**

The app should:

1. Fetch products

2. Score their SEO quality

3. Display results inside Shopify Admin

4. Allow editing SEO fields

5. Keep SEO scores updated using webhooks

---

# **Functional Requirements**

---

## **1️⃣ App Setup**

* App must install on a Shopify development store

* Proper OAuth flow

* Access token stored securely

* Use latest Shopify API version

* GraphQL preferred

---

## **2️⃣ Initial Product Sync (Backend)**

On app install (or via “Sync Products” button):

Fetch first 50 products with:

* Product ID

* Title

* Handle

* SEO title

* SEO description

* Description HTML

* Status

Store in a database (SQLite/Postgres acceptable).

Pagination required.

---

## **3️⃣ SEO Scoring Logic (Backend)**

Create a simple SEO scoring system.

For each product:

### **Checks:**

* Title length \< 30 → too short

* Title length \> 60 → too long

* Meta description missing

* Meta description \< 120 characters

* Primary keyword missing in meta description

   (Primary keyword \= first 2–3 words of title)

Assign:

* SEO score (0–100)

* List of issues

SEO logic must live in its own module/service.

---

## **4️⃣ Webhook: products/update**

Subscribe to:

products/update

When a product is updated:

* Re-run SEO scoring

* Update stored SEO score

* Update issues list

Must include:

* HMAC verification

* Idempotency handling

* Proper error handling

This ensures the app stays in sync automatically.

---

## **5️⃣ Embedded Admin UI**

Create a clean embedded dashboard.

Polaris optional but encouraged.

---

### **A. Summary Section**

Display:

* Total products analyzed

* Average SEO score

* Products with missing meta description

* Products with SEO score \< 60

---

### **B. Product Table**

Show:

| Product Title | SEO Score | Issues | Edit |

Issues should display as small badges like:

* Meta Missing

* Title Too Short

* Keyword Missing

---

### **C. Edit Modal / Drawer**

When clicking “Edit”:

Allow editing:

* SEO title

* Meta description

On save:

* Update Shopify via Admin API

* Update local DB

* Recalculate SEO score

* Refresh UI

No page reload.

---

# **Technical Requirements**

Must demonstrate:

* Clean folder structure

* Separation of:

  * API routes

  * Services

  * SEO logic

  * Webhook handler

* Webhook HMAC verification

* Idempotency protection

* Environment variables

* Proper error handling

* Pagination handling

Avoid:

* Everything in one file

* Hardcoded values

* Skipping webhook verification

---

# **Bonus (Optional but Strong Signal)**

* Bulk re-score button

* Sorting by SEO score

* Search/filter products

* Auto-generate improved meta description

* Basic loading states

* Logging table

* Background queue

---

# **Deliverables**

1. GitHub repository

2. README including:

   * Setup instructions

   * Architecture explanation

   * How webhook verification works

   * How idempotency is handled

   * What you would improve for production

---

# **Evaluation Criteria**

We will evaluate:

| Area | What We Look For |
| ----- | ----- |
| Shopify fundamentals | OAuth \+ GraphQL usage |
| Webhooks | Proper verification \+ clean handling |
| Backend structure | Clear services & modular logic |
| SEO thinking | Logical scoring system |
| Frontend quality | Clean state management |
| Production thinking | Rate limits, scaling notes |
| Communication | Clear explanation |

---


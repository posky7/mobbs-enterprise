# Cheshire & Co — Craft Booth App

**Last Updated:** 2026-04-08

---

## 1. Project Overview

**Cheshire & Co** is a mobile-first web application for craft booth vendors to manage inventory, record sales, track expenses, and monitor profit/margin across multiple physical market locations.

### Tech Stack
- **Frontend:** Vanilla HTML, CSS (custom properties + inline Tailwind-style classes), vanilla JavaScript (no framework)
- **Backend:** Netlify Functions (ES modules, `.mjs`)
- **Storage:** Netlify Blob Storage via `_blob-storage.mjs`
- **Hosting:** Netlify

### Target Users
Craft vendors who sell handmade goods (ceramics, glassware, art, etc.) at physical markets, fairs, and consignment booths. Users are non-technical and need a fast, forgiving mobile UI.

---

## 2. Key Files

| File | Purpose |
|---|---|
| `inventory.html` | Full SPA (~1400+ lines). Inventory list, sold cards, modals for Add/Edit/Move/Record Sale |
| `finance.html` | Finance hub — expenses, loans, sales summary |
| `finance-expenses.html` | Expense tracking |
| `finance-loans.html` | Loan tracking with payment history |
| `finance-sales.html` | Sales summary across locations |
| `netlify/functions/inventory.mjs` | Inventory API — handles GET, POST, PUT `/inventory/{id}`, and POST actions: `recordSale`, `transfer`, `updateItem`, `updateNotes` |
| `netlify/functions/locations.mjs` | Locations API — GET, POST, PUT |
| `netlify/functions/expenses.mjs` | Expenses API — GET, PUT only |
| `netlify/functions/loans.mjs` | Loans API — GET, PUT, POST `?action=add-payment` |
| `netlify/functions/images.mjs` | Image upload/retrieval |
| `netlify/functions/_blob-storage.mjs` | Shared `readBlobData` / `writeBlobData` helpers |

### Key DOM IDs in `inventory.html`
- `modal-record-sale` — Record Sale modal
- `modal-add` — Add Item modal
- `modal-edit` — Edit Item modal
- `modal-move` — Move Inventory modal
- `move-item`, `move-from`, `move-to`, `move-qty` — Move modal selects/inputs
- `btn-move` — Move submit button (disabled until `validateMoveForm()` passes)
- `inv-list` — rendered inventory cards
- `sold-list` — rendered sold cards inside `sold-section`

### Key JavaScript Functions in `inventory.html`
| Function | Purpose |
|---|---|
| `submitSale()` | Submits a sale from `modal-record-sale` |
| `openDetail(id)` | Opens the Edit modal for an item |
| `openMoveModal()` | Opens Move Inventory modal |
| `performMove()` | Submits inventory transfer via POST `?action=transfer` |
| `validateMoveForm()` | Validates move modal; enables/disables `btn-move` |
| `onMoveItemChange()` | Repopulates from/to selects when item changes |
| `onMoveFromChange()` | Repopulates to select; sets qty max |
| `renderSoldList()` | Renders one card per individual sale transaction |
| `renderInventory()` | Renders active inventory cards |
| `showToast(msg)` | Displays a temporary feedback toast |
| `getLocationFeePercent(locationId)` | Returns `transactionFeePercent` for a location from the `locations` array |

---

## 3. Core Development Rules

### Always Mobile-First
- Default layout targets 375px–430px screens. Widen at `768px` and `1024px` breakpoints.
- All tap targets must be at least `44px` tall (`min-height: 44px` on buttons).
- Fixed bottom nav requires `padding-bottom: 80px` on `<main>` — never remove this.

### Code Style
- No build step, no bundler, no TypeScript. Plain `.html` and `.mjs` files.
- Use the existing CSS custom properties (`--bg`, `--surface`, `--accent`, `--text`, `--text2`, `--text3`, `--border`) — do not introduce new color literals.
- Escape all user-supplied strings rendered into HTML using the existing `esc()` helper.
- Keep comments minimal; only comment logic that is genuinely non-obvious.

### Monetary Formatting
- Always format dollar values via the existing `fmt(value)` helper (returns `$X.XX`).
- Display margins as whole-number percentages (`Math.round`).
- Never display raw floats like `4.9999999`.

### Error Handling & User Feedback
- Surface all async errors to the user via `showToast(msg)` — never silently swallow errors.
- Show inline validation errors near the failing field (see `#move-qty-error` as the pattern).
- Disable submit buttons (`disabled` attribute) until the form is valid; re-enable reactively.
- On success, call `showToast('...')` and reload or patch the local `inventory` array without a full page refresh where possible.

---

## 4. Inventory Management Rules

### Profit & Margin Calculation

These formulas are canonical. Use them everywhere — in modals, sold cards, and the backend `recordSale` action.

```
totalCostPerUnit = item.cost + item.labor
feeAmount        = actualPrice × (feePercent / 100)
effectiveRevenue = actualPrice - feeAmount
profit           = effectiveRevenue - (qtySold × totalCostPerUnit)
margin           = Math.round((profit / actualPrice) × 100)   // % of sale price
```

- `feePercent` comes from the selling **location's** `transactionFeePercent` field, not from a hardcoded map.
- `margin` is always expressed as a percentage of the actual sale price, not cost.
- Negative profit/margin is valid and must display with a red color class (`.neg` / `.cost`).
- The backend (`inventory.mjs` → `recordSale`) recalculates profit server-side as a safeguard but accepts client-calculated `margin` and `feeAmount` if provided (client may apply flat fees not expressible as a percentage).

### Location Fees
Transaction fees are stored dynamically on each location object (`transactionFeePercent`). There is **no hardcoded fee map** in code. Always look up fees at runtime via:

```js
const feePercent = locations.find(l => l.id === locationId)?.transactionFeePercent || 0;
```

### Sold Cards Behavior
- `renderSoldList()` renders **one card per individual sale transaction** (not aggregated per item).
- Source of truth: `item.salesHistory[]` — an array of individual sale records.
- Cards are sorted by `sale.date` descending (most recent first).
- Each card shows: item name, category, location name, date, qty sold, revenue, fee ($+%), profit, margin.
- Profit and margin are recalculated at render time using stored `feePercent`; stored `sale.margin` takes precedence if non-zero.
- Cards are filtered by `inventoryLocationFilter` (location filter dropdown) if set.

### Move Inventory Modal Rules
The modal uses a cascading 4-step UX:

1. **Select Item** — only items with total qty > 0 appear. Dropdown shows `"Item Name (N total)"`.
2. **Select From Location** — only locations where that item has qty > 0.
3. **Select To Location** — all active locations except the selected From location.
4. **Enter Quantity** — must be a positive integer ≤ available qty at From location.

Validation (`validateMoveForm()`):
- All four fields must be filled.
- From ≠ To (enforced by populating To without the From option).
- Qty must be `>= 1`, an integer, and `<= fromQty`.
- `#btn-move` is `disabled` until all rules pass; inline error shown in `#move-qty-error`.

On submit (`performMove()`):
- POST to `/netlify/functions/inventory?action=transfer` with `{ itemId, fromLocation, toLocation, quantity }`.
- On success: patch local `inventory` array in memory, call `renderInventory()`, show toast, close modal.
- The backend deletes the source location entry if its qty reaches 0 after transfer.

---

## 5. Data Models

### Inventory Item
```jsonc
{
  "id": "abc123",           // string, auto-generated (base36 timestamp + random)
  "version": 1,             // migration version
  "name": "Blue Mug",
  "category": "Ceramic Tableware",
  "cost": 4.50,             // material cost per unit ($)
  "labor": 2.00,            // labor cost per unit ($)
  "suggestedPrice": 22.00,  // suggested retail price ($)
  "reorderPt": 5,           // reorder threshold (qty)
  "notes": "Optional text",
  "imageUrl": null,         // legacy single image URL
  "images": ["imageId1"],   // array of image IDs (preferred)
  "inventory": {
    "<locationId>": {
      "qty": 12,
      "lastUpdated": "2026-04-08T10:00:00.000Z"
    }
  },
  "salesHistory": [
    // See Sale Record shape below
  ]
}
```

### Sale Record (inside `salesHistory[]`)
```jsonc
{
  "id": "1712500000000",    // string timestamp
  "date": "2026-04-08",     // ISO date string (YYYY-MM-DD)
  "location": "<locationId>",
  "qtySold": 2,
  "actualPrice": 20.00,     // total revenue for this sale
  "feePercent": 10,         // transaction fee %
  "feeAmount": 2.00,        // dollar amount of fee
  "profit": 13.00,          // after fee and cost
  "margin": 65              // percent of sale price
}
```

### Location
```jsonc
{
  "id": "1712500000001",
  "name": "Saturday Market",
  "active": true,
  "type": "retail",
  "transactionFeePercent": 10,  // % charged on each sale at this location
  "monthlyRent": 150,           // fixed monthly booth cost ($)
  "isWarehouse": false          // only one location can be warehouse
}
```

---

## 6. UI/UX Best Practices

### Fixed Bottom Navigation
- `<nav>` is `position: fixed; bottom: 0`. Always keep `padding-bottom: 80px` on `<main>`. This is **Bug 2** fix — do not remove it.
- Nav links use `.active` class for the current page.

### Modal Design Standards
- All modals use the `.modal-overlay` + `.modal` pattern with `.modal-header`, `.modal-body`, `.modal-footer`.
- Max width: `500px`, `max-height: 90vh`, `overflow-y: auto`.
- Always include a close button (`×`) that calls `closeModal('<modal-id>')`.
- Footer has Cancel + primary action button. Primary action is disabled until valid.
- Open via `openModal('<id>')`, close via `closeModal('<id>')` — these toggle `display:none`.

### Form Validation Approach
- Validate reactively on `oninput` / `onchange` — not only on submit.
- Use inline error elements (e.g. `<div id="...-error">`) placed immediately below the failing field.
- Show `display:none` by default; set `style.display = 'block'` with an error message on failure.
- The submit button's `disabled` state is the primary guard — always reflect current validity.

### Success/Error Feedback
- `showToast(message)` — transient bottom toast (fades in/out via `.show` class on `#toast`).
- For destructive or irreversible actions, confirm with the user first (e.g. `confirm()` or a dedicated confirmation modal).
- Green: `#28a745`, Red: `#d73a49`, Accent: `var(--accent)` (`#5b4fcf`).

---

## 7. API Reference

### Inventory (`/netlify/functions/inventory`)

| Method | Path / Query | Body | Purpose |
|---|---|---|---|
| GET | `/inventory` | — | Fetch all inventory (auto-migrates) |
| POST | `/inventory` | item or item[] | Add new item(s) |
| PUT | `/inventory` | item[] | Replace full inventory array |
| PUT | `/inventory/{id}` | partial item | Merge-update a single item |
| DELETE | `/inventory` | — | Clear all inventory |
| POST | `?action=recordSale` | `{ itemId, location, qtySold, actualPrice, date, feePercent, feeAmount?, margin? }` | Record a sale, decrement qty |
| POST | `?action=transfer` | `{ itemId, fromLocation, toLocation, quantity }` | Move qty between locations |
| POST | `?action=updateItem` | `{ itemId, patch }` | Partial patch a single item |
| POST | `?action=updateNotes` | `{ itemId, notes }` | Update item notes only |

### Locations (`/netlify/functions/locations`)
| Method | Purpose |
|---|---|
| GET | Fetch all locations |
| POST | Add a new location |
| PUT | Replace full locations array |

### Expenses (`/netlify/functions/expenses`)
| Method | Purpose |
|---|---|
| GET | Fetch all expenses |
| PUT | Replace expenses array |

### Loans (`/netlify/functions/loans`)
| Method | Purpose |
|---|---|
| GET | Fetch all loans |
| PUT | Replace loans array |
| POST `?action=add-payment` | Append a payment to a loan |

---

## 8. How to Respond to Coding Requests

When making changes to this project, structure your response as:

1. **Summary of the problem** — one or two sentences describing the root cause or feature gap.
2. **Updated code** — provide the full updated file(s), or clearly delimited diff-style sections for large files. Never provide partial snippets that leave the file in a broken state.
3. **Summary of changes** — bullet list of what was changed and why.

### When to Update This File
Update `claude.md` when:
- A new page or feature is added (new modals, new API endpoints, new data fields).
- A formula changes (profit, margin, fee calculation).
- A new UI pattern is introduced (new toast style, new validation approach).
- A known bug fix changes a behavior that was previously documented here.

Always update the **Last Updated** date at the top when editing this file.

---

## 9. Known Bugs Fixed (Reference)

| Bug | Location | Fix Summary |
|---|---|---|
| Bug 1 | `inventory.mjs` → `recordSale` | Normalize `margin` and `feeAmount` during migration; accept client-calculated values as override |
| Bug 2 | `inventory.html` `<main>` | Added `padding-bottom: 80px` so content clears the fixed bottom nav |
| Bug 3 | `renderSoldList()` | Render one card per sale transaction from `salesHistory[]`, not aggregated per item |
| Bug 4 | PUT `/inventory/{id}` | Merge-update a single item without overwriting the full array |

---
name: invoice
description: Professional invoice document with line items, subtotal/tax/total calculation, payment terms, bank details, and brand header. Print-ready and PDF-exportable.
---

# Invoice

Use this skill to produce professional invoice artifacts. Output is a clean, print-ready HTML invoice that renders well as PDF.

## Invoice Layout

```
┌─────────────────────────────────────────────────────┐
│ [Company Logo]              INVOICE                  │
│ Company Name                Invoice #: INV-2025-042  │
│ Address Line                Date: June 15, 2025      │
│ City, State, ZIP            Due Date: July 15, 2025  │
│ Tax ID: XX-XXXXXXX                                   │
├─────────────────┬───────────────────────────────────┤
│ BILL TO         │  SHIP TO (if applicable)           │
│ Client Name     │  (omit if not needed)              │
│ Client Address  │                                    │
│ Contact email   │                                    │
├─────────────────┴───────────────────────────────────┤
│ Desc.        | Qty  | Unit Price  | Amount           │
│ ─────────────┼──────┼─────────────┼──────────       │
│ Service A    | 10h  | $150.00     | $1,500.00        │
│ Service B    | 1    | $500.00     | $500.00          │
│              |      |             |                  │
│              |      | Subtotal    | $2,000.00        │
│              |      | Tax (10%)   | $200.00          │
│              |      | TOTAL       | $2,200.00        │
├─────────────────────────────────────────────────────┤
│ Payment Terms: Net 30                                │
│ Bank: First National Bank                           │
│ Account: XXXXXXXXXX   Routing: XXXXXXXXX            │
│                                                      │
│ Notes: [custom message to client]                   │
└─────────────────────────────────────────────────────┘
```

## Line Item Calculation

Always calculate automatically:
```javascript
const subtotal = items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
const tax = subtotal * (taxRate / 100);
const total = subtotal + tax;
```

All amounts right-aligned with consistent decimal places (2 decimal places always).

## Invoice Number Format

Auto-generate realistic invoice numbers:
- `INV-2025-042` (year + sequential)
- `#000123` (sequential only)
- `[PREFIX]-[YEAR][MONTH]-[SEQ]` — e.g., `ACM-202506-001`

## Payment Terms Standards

Common terms to use correctly:
- **Net 30**: Payment due 30 days from invoice date
- **Net 15**: Payment due 15 days
- **Due on receipt**: Immediate payment expected
- **50% upfront**: Deposit note in terms section

## Status Badge (for repeat invoices)

Show invoice status prominently:
- `UNPAID` — amber, top right
- `PAID` — green, top right with paid date
- `OVERDUE` — red, top right
- `DRAFT` — gray, watermark-style

## Print/PDF Rules

- No fixed positioning (breaks PDF export)
- White background, no dark mode
- Font size minimum 11px for print
- Page break before totals section if content is long
- Print margins: 2cm all sides
- `@media print` rules to hide browser chrome

## Currency Formatting

Use `Intl.NumberFormat` for correct locale formatting:
```javascript
const fmt = new Intl.NumberFormat('en-US', { 
  style: 'currency', 
  currency: 'USD' 
});
fmt.format(2200.00); // "$2,200.00"
```

## Required Fields Checklist

- [ ] Invoice number (unique)
- [ ] Invoice date
- [ ] Due date
- [ ] Biller name and address
- [ ] Client name and address
- [ ] Itemized line items with descriptions
- [ ] Subtotal, tax (if applicable), total
- [ ] Payment instructions or bank details
- [ ] Payment terms

## Optional Sections

- Project/PO reference number
- Notes/memo to client
- Late payment fee terms
- Multi-currency support
- Logo and brand colors matching active design system

/**
 * Expense categories → sub-categories (V2 Change 5). Shared by the client
 * dropdowns and server validation so they can never drift apart.
 */
export const EXPENSE_CATEGORIES = {
  Building: ["Rent", "Renovation", "Furniture", "Repairs", "Cleaning", "Security"],
  Utilities: ["Electricity", "Water", "Internet", "Phone/SIM"],
  Stationary: ["Books", "Paper", "Notebooks", "Pens & Pencils", "Markers & Chalk", "Printer Ink", "Other"],
  Advertising: ["Social Media Ads", "Printing/Banners", "SMS Marketing", "Other"],
  Salaries: ["Teacher Salaries", "Staff Salaries", "Bonuses"],
  Taxes: ["Income Tax", "Social Tax", "VAT", "Other"],
  Equipment: ["Computers", "Projectors", "Furniture", "Appliances", "Other"],
  Other: ["Miscellaneous"],
} as const;

export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;

export const EXPENSE_CATEGORY_NAMES = Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[];

export function isValidCategory(c: string): c is ExpenseCategory {
  return c in EXPENSE_CATEGORIES;
}

export function subCategoriesFor(c: string): readonly string[] {
  return isValidCategory(c) ? EXPENSE_CATEGORIES[c] : [];
}

export const EXPENSE_PAYMENT_METHODS = ["cash", "bank_transfer", "card"] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

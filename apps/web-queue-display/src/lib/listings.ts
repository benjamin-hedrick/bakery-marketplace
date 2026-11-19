// The vendor's listing form and list (WI-CAT-008): the parts with no React, so they can be unit tested. The catalog decides every rule (prices, limits,
// which allergens and tags exist, what a stock change may do); this file only turns what the vendor typed into the BFF's input, puts the catalog's
// answers back beside the right fields, and words things for the screen. A check here is about the shape of what was typed (a price must be a number
// to be sent at all), never a listing rule.

export type ListingStatus = 'DRAFT' | 'PUBLISHED';
export type StockMode = 'MADE_TO_ORDER' | 'COUNTED';

/** A listing as the screens load it (the BFF's MyListing). */
export interface LoadedListing {
  readonly id: string;
  readonly name: string;
  readonly description: string | null | undefined;
  readonly category: string;
  readonly price: { readonly cents: number; readonly currency: string };
  readonly status: string;
  readonly allergenFlags: readonly string[];
  readonly tags: readonly { readonly id: string; readonly label: string }[];
  readonly modifiers: readonly {
    readonly id: string;
    readonly name: string;
    readonly priceDelta: { readonly cents: number };
    readonly allergens: readonly string[];
    readonly tags: readonly { readonly id: string }[];
  }[];
  readonly stock: {
    readonly status: string;
    readonly maxPerOrder: number | null | undefined;
    readonly availableQuantity: number | null | undefined;
    readonly lowStockThreshold: number | null | undefined;
  };
  readonly editVersion: number;
  readonly updatedAt: string;
}

export interface OptionForm {
  /** React's key for the row; never sent. */
  key: string;
  /** The option's own id: kept for an option the listing had, made once for a new one. */
  id: string;
  name: string;
  /** The price difference as typed, in dollars and cents. */
  price: string;
  allergens: string[];
  tags: string[];
}

export interface ListingForm {
  name: string;
  description: string;
  category: string;
  price: string;
  allergens: string[];
  tags: string[];
  options: OptionForm[];
  mode: StockMode;
  /** The starting count: on a create, or when a made-to-order listing becomes counted. Never sent for a listing that stays counted. */
  startingQuantity: string;
  maxPerOrder: string;
  lowStockThreshold: string;
  status: ListingStatus;
}

/** The BFF's ListingInput. */
export interface ListingInput {
  name: string;
  description: string | null;
  category: string;
  priceCents: number;
  status: ListingStatus;
  modifiers: { id: string; name: string; priceDeltaCents: number; allergens: string[]; tags: string[] }[];
  allergenFlags: string[];
  tags: string[];
  stock: {
    mode: StockMode;
    availableQuantity?: number;
    maxPerOrder: number | null;
    lowStockThreshold: number | null;
  } | null;
}

export const emptyForm = (): ListingForm => ({
  name: '',
  description: '',
  category: '',
  price: '',
  allergens: [],
  tags: [],
  options: [],
  mode: 'MADE_TO_ORDER',
  startingQuantity: '',
  maxPerOrder: '',
  lowStockThreshold: '',
  status: 'DRAFT',
});

/** Cents as the screen shows them: "$8.50". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Cents as the form shows them for editing: "8.50". */
export const centsToField = (cents: number): string => formatCents(cents).replace('$', '');

/**
 * Dollars and cents as typed ("8", "8.5", "8.50", "$8.50", "1,250.00") to integer cents. Null when it is not a price at all; a negative price or one past
 * the catalog's limit is sent, and the catalog answers. Seven digits of dollars at most, so the cents always fit the BFF's Int.
 */
export function parseDollars(text: string): number | null {
  const cleaned = text.trim().replace(/^\$/, '').replace(/,/g, '');
  const match = /^(-?)(\d{1,7})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const cents = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'));
  return match[1] === '-' ? -cents : cents;
}

/** A whole number as typed. Null for an empty field; 'invalid' when it is not a whole number that fits the BFF's Int. */
export function parseWhole(text: string): number | null | 'invalid' {
  const t = text.trim();
  if (t === '') return null;
  if (!/^-?\d{1,9}$/.test(t)) return 'invalid';
  return Number(t);
}

const PRICE_FORMAT = 'Enter a price in dollars and cents, like 4.50.';
const WHOLE_FORMAT = 'Enter a whole number.';

/** A short id for a new option, as the catalog wants it (lowercase letters, digits and hyphens). Made once, when the option is added. */
export function newOptionId(random: () => number = Math.random): string {
  return `opt-${Math.floor(random() * 36 ** 8)
    .toString(36)
    .padStart(8, '0')}`;
}

/** The form for a loaded listing: every field it had, so a save sends them all back (a missing options list would remove the options). */
export function formFromListing(l: LoadedListing): ListingForm {
  const counted = l.stock.availableQuantity !== null && l.stock.availableQuantity !== undefined;
  return {
    name: l.name,
    description: l.description ?? '',
    category: l.category,
    price: centsToField(l.price.cents),
    allergens: [...l.allergenFlags],
    tags: l.tags.map((t) => t.id),
    options: l.modifiers.map((m) => ({
      key: m.id,
      id: m.id,
      name: m.name,
      price: centsToField(m.priceDelta.cents),
      allergens: [...m.allergens],
      tags: m.tags.map((t) => t.id),
    })),
    mode: counted ? 'COUNTED' : 'MADE_TO_ORDER',
    startingQuantity: '',
    maxPerOrder: l.stock.maxPerOrder === null || l.stock.maxPerOrder === undefined ? '' : String(l.stock.maxPerOrder),
    lowStockThreshold:
      l.stock.lowStockThreshold === null || l.stock.lowStockThreshold === undefined
        ? ''
        : String(l.stock.lowStockThreshold),
    status: l.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
  };
}

/**
 * The BFF's input for the form, or the fields whose text cannot be sent (not a number). `loadedCounted` is whether the listing being edited keeps a
 * count (null on a create): a listing that stays counted is sent without a quantity (ADR-0017: the count changes only by an adjustment), a switch to
 * counted sends the starting count, and made to order sends none.
 */
export function toInput(
  form: ListingForm,
  loadedCounted: boolean | null,
): { input: ListingInput } | { problems: Record<string, string> } {
  const problems: Record<string, string> = {};
  const priceCents = parseDollars(form.price);
  if (priceCents === null) problems['priceCents'] = PRICE_FORMAT;

  const whole = (field: string, text: string) => {
    const value = parseWhole(text);
    if (value === 'invalid') {
      problems[field] = WHOLE_FORMAT;
      return null;
    }
    return value;
  };
  const maxPerOrder = whole('stock.maxPerOrder', form.maxPerOrder);
  const lowStockThreshold = whole('stock.lowStockThreshold', form.lowStockThreshold);
  const sendsStart = form.mode === 'COUNTED' && loadedCounted !== true;
  const starting = sendsStart ? whole('stock.availableQuantity', form.startingQuantity) : null;

  const modifiers = form.options.map((o, i) => {
    const delta = parseDollars(o.price === '' ? '0' : o.price);
    if (delta === null) problems[`modifiers[${i}].priceDeltaCents`] = PRICE_FORMAT;
    return { id: o.id, name: o.name, priceDeltaCents: delta ?? 0, allergens: o.allergens, tags: o.tags };
  });
  if (Object.keys(problems).length > 0) return { problems };

  return {
    input: {
      name: form.name,
      description: form.description.trim() === '' ? null : form.description,
      category: form.category,
      priceCents: priceCents as number,
      status: form.status,
      modifiers,
      allergenFlags: form.allergens,
      tags: form.tags,
      stock: {
        mode: form.mode,
        ...(sendsStart && starting !== null ? { availableQuantity: starting } : {}),
        maxPerOrder,
        lowStockThreshold,
      },
    },
  };
}

/** The form field a catalog field name belongs to (the id of the element the message goes beside), or null for the summary only. */
export function formFieldFor(field: string): string | null {
  const simple: Record<string, string | null> = {
    name: 'listing-name',
    description: 'listing-description',
    category: 'listing-category',
    priceCents: 'listing-price',
    status: 'listing-status',
    modifiers: 'listing-options',
    'stock.mode': 'listing-mode',
    'stock.availableQuantity': 'listing-starting-quantity',
    'stock.maxPerOrder': 'listing-max-per-order',
    'stock.lowStockThreshold': 'listing-threshold',
    // Made by the screen, not typed: a problem with them is shown in the summary.
    idempotencyKey: null,
    expectedEditVersion: null,
  };
  if (Object.hasOwn(simple, field)) return simple[field] ?? null;
  if (/^allergenFlags(\[\d+\])?$/.test(field)) return 'listing-allergens';
  if (/^tags(\[\d+\])?$/.test(field)) return 'listing-tags';
  const option = /^modifiers\[(\d+)\](?:\.(\w+))?/.exec(field);
  if (option) {
    const part = option[2];
    const index = option[1];
    if (part === 'priceDeltaCents') return `option-${index}-price`;
    if (part === 'allergens') return `option-${index}-allergens`;
    if (part === 'tags') return `option-${index}-tags`;
    return `option-${index}-name`; // the name, the id (made by the screen) or the option as a whole
  }
  return null;
}

/** Field problems grouped by the form element they belong to; the ones that belong to no element are kept for the summary. */
export function groupProblems(fields: readonly { field: string; message: string }[]): {
  byElement: Record<string, string[]>;
  unplaced: string[];
} {
  const byElement: Record<string, string[]> = {};
  const unplaced: string[] = [];
  for (const f of fields) {
    const element = formFieldFor(f.field);
    if (element === null) unplaced.push(f.message);
    else (byElement[element] ??= []).push(f.message);
  }
  return { byElement, unplaced };
}

const STOCK_STATUS_TEXT: Record<string, string> = { IN_STOCK: 'In stock', LOW: 'Low', SOLD_OUT: 'Sold out' };

/** "Made to order", or "12 left · Low". */
export function stockText(stock: LoadedListing['stock']): string {
  if (stock.availableQuantity === null || stock.availableQuantity === undefined) return 'Made to order';
  return `${stock.availableQuantity} left · ${STOCK_STATUS_TEXT[stock.status] ?? stock.status}`;
}

/** What the vendor is told for each refusal and failure, in words (never a code). */
export const LISTING_TEXT = {
  INVALID: 'The listing could not be saved as entered. Check the fields marked below.',
  NOT_FOUND: 'That listing could not be found. It may not be one of yours.',
  VENDOR_NOT_VERIFIED: 'Your shop must be verified before a listing can go live.',
  CHANGED: 'This listing was changed since you opened it, so your changes were not saved.',
  MADE_TO_ORDER: 'This listing is made to order, so it has no count to change.',
  INSUFFICIENT_STOCK: 'The count had changed, so that many could not be removed. The current count is shown.',
  KEY_REUSED: 'This listing was already created.',
  FORBIDDEN: 'This login is not a vendor’s, so there are no listings to show.',
  LOGIN_ENDED: 'Your login has ended. Please log in again.',
  FAILED: 'That did not work. Please try again.',
} as const;

import type { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import type { Context } from '../resolvers.ts';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** An ISO 8601 instant in UTC, as the service sent it. */
  DateTime: { input: string; output: string; }
};

export type CancelOrderDone = {
  __typename?: 'CancelOrderDone';
  /** The Order global id the cancel was sent for. */
  orderId: Scalars['ID']['output'];
  /** The order's status after the cancel (CANCELLED). */
  status: OrderStatus;
};

export type CancelOrderInput = {
  /** An Order global id (the customer's own order). */
  orderId: Scalars['ID']['input'];
};

export type CancelOrderPayload = CancelOrderDone | CancelOrderRejected;

/** An expected refusal. The message is fixed client-safe text. */
export type CancelOrderRejected = {
  __typename?: 'CancelOrderRejected';
  code: CancelOrderRejectionCode;
  /** For NOT_ALLOWED_NOW: where the order is now, when ordering said. */
  currentStatus?: Maybe<OrderStatus>;
  message: Scalars['String']['output'];
};

export type CancelOrderRejectionCode =
  /** The order's status does not allow a cancel now (it is being prepared, or it is already completed or cancelled). */
  | 'NOT_ALLOWED_NOW'
  /** No such order for this customer (a missing and another customer's order look the same). */
  | 'NOT_FOUND';

export type CartLineCheck = {
  __typename?: 'CartLineCheck';
  conflicts: Array<Conflict>;
  /** How the line, with the options chosen on it, stands against the diets the caller prefers (WI-TAG-004). */
  dietMatches: Array<DietMatch>;
  /** False when the listing does not exist or is not public; its conflicts are then empty. */
  found: Scalars['Boolean']['output'];
  /** The Listing global id that was sent. */
  listingId: Scalars['ID']['output'];
  /** Option ids the listing does not have; they count for nothing. */
  unknownOptionIds: Array<Scalars['ID']['output']>;
};

export type CartLineInput = {
  /** A Listing global id. */
  listingId: Scalars['ID']['input'];
  /** The raw ids of the options chosen on this line. */
  optionIds: Array<Scalars['ID']['input']>;
};

/**
 * One allergen of the caller's profile found on a listing. No conflict is an empty list and never means the listing is safe: a bakery's flags may be
 * incomplete, and the product must not say otherwise.
 */
export type Conflict = {
  __typename?: 'Conflict';
  /** An allergen id from the tag registry (the `tags` query). */
  allergenId: Scalars['ID']['output'];
  /** For an OPTION conflict, the options (their raw ids) that contain the allergen; empty for ITEM. */
  optionIds: Array<Scalars['ID']['output']>;
  severity: ConflictSeverity;
  source: ConflictSource;
};

export type ConflictSeverity =
  /** An allergen the customer must avoid. */
  | 'ALLERGY'
  /** An allergen the customer would rather avoid. */
  | 'AVOID';

export type ConflictSource =
  /** The listing itself is marked with the allergen. */
  | 'ITEM'
  /** Only some options of the listing are; see optionIds. */
  | 'OPTION';

/**
 * How a listing stands against one diet the caller prefers. It is the bakery's claim and never a finding: not marked does not mean not vegan. A configured item is
 * marked for a diet only if the item carries the tag and every chosen option does too (ADR-0022 amendment 2026-11-04); with no options chosen (browse, detail) it is
 * marked when the item is, and optionIdsNotMarked names the options that would remove the claim.
 */
export type DietMatch = {
  __typename?: 'DietMatch';
  /** Whether the listing itself carries the tag. */
  itemMarked: Scalars['Boolean']['output'];
  /** Whether the bakery has marked the listing, as configured, for the diet. */
  marked: Scalars['Boolean']['output'];
  /** Options that do not carry the tag: every option for browse and detail, only the chosen ones for a cart check. */
  optionIdsNotMarked: Array<Scalars['ID']['output']>;
  /** A diet tag id from the registry (the `tags` query). */
  tagId: Scalars['ID']['output'];
};

export type FieldProblem = {
  __typename?: 'FieldProblem';
  field: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type LineItemInput = {
  /** A Listing global id. */
  listingId: Scalars['ID']['input'];
  modifierIds: Array<Scalars['ID']['input']>;
  quantity: Scalars['Int']['input'];
};

export type Listing = Node & {
  __typename?: 'Listing';
  allergenFlags: Array<Scalars['String']['output']>;
  category: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  modifiers: Array<Modifier>;
  name: Scalars['String']['output'];
  price: Money;
  stock: Stock;
  /**
   * The listing's tags (ADR-0022): only those the catalog shows today (public and inside their window), as the catalog sent them. A diet tag is the
   * bakery's own claim, not something the product checked. Allergens are not tags.
   */
  tags: Array<Tag>;
  vendorId: Scalars['ID']['output'];
};

export type ListingConnection = {
  __typename?: 'ListingConnection';
  edges: Array<ListingEdge>;
  pageInfo: PageInfo;
};

export type ListingEdge = {
  __typename?: 'ListingEdge';
  cursor: Scalars['String']['output'];
  node: Listing;
};

export type Modifier = {
  __typename?: 'Modifier';
  allergens: Array<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  priceDelta: Money;
  /** The option's tags (ADR-0022): only those the catalog shows today (public and inside their window). Allergens are not tags. */
  tags: Array<Tag>;
};

export type Money = {
  __typename?: 'Money';
  cents: Scalars['Int']['output'];
  currency: Scalars['String']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  /**
   * A customer cancels one of their own orders. Needs a bearer token (UNAUTHENTICATED without one). Ordering-service decides who is acting, from
   * whose order it is: a customer may cancel their own order while it is PLACED or CONFIRMED; a vendor's token on its own order is a vendor cancel
   * (the queue display uses vendorOrderAction for that); a role that is neither is FORBIDDEN. Expected refusals come back as CancelOrderRejected,
   * not as errors. The result is the order's new status.
   */
  cancelOrder: CancelOrderPayload;
  /** Places an order for the caller (the payment is a stub). Needs a bearer token. Expected failures come back as PlaceOrderRejected, not as errors. */
  placeOrder: PlaceOrderPayload;
  /**
   * Replaces the caller's allergen profile (WI-PREF-001). Needs a customer's bearer token (UNAUTHENTICATED without one, FORBIDDEN for another
   * role). Expected refusals come back as SavePreferencesRejected, not as errors. Saving two empty lists clears the profile.
   */
  savePreferences: SavePreferencesPayload;
  /**
   * A vendor's action on one of their own orders (WI-QUE-004). Needs a vendor's bearer token (UNAUTHENTICATED without one, FORBIDDEN for another
   * role). Ordering-service decides whether the order is the caller's and whether its status allows the action; expected refusals come back as
   * VendorOrderActionRejected, not as errors. The result is the order's new status: the queue learns of the change from the stream or the list.
   */
  vendorOrderAction: VendorOrderActionPayload;
};


export type MutationCancelOrderArgs = {
  input: CancelOrderInput;
};


export type MutationPlaceOrderArgs = {
  input: PlaceOrderInput;
};


export type MutationSavePreferencesArgs = {
  input: SavePreferencesInput;
};


export type MutationVendorOrderActionArgs = {
  input: VendorOrderActionInput;
};

export type Node = {
  id: Scalars['ID']['output'];
};

export type Order = Node & {
  __typename?: 'Order';
  /**
   * The allergens the customer chose to tell the bakery about for this order (ids from the `tags` registry; the screens map them to labels). Fixed once the
   * order is placed. Empty when none were chosen, and for orders placed before this existed.
   */
  allergens: Array<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  lineItems: Array<OrderLineItem>;
  /** Null when the customer did not request a window (it is optional, D-3). */
  pickupWindow?: Maybe<PickupWindow>;
  status: OrderStatus;
  total: Money;
  vendorId: Scalars['ID']['output'];
};

export type OrderConnection = {
  __typename?: 'OrderConnection';
  edges: Array<OrderEdge>;
  pageInfo: PageInfo;
};

export type OrderEdge = {
  __typename?: 'OrderEdge';
  cursor: Scalars['String']['output'];
  node: Order;
};

export type OrderLineItem = {
  __typename?: 'OrderLineItem';
  /** A Listing global id. */
  listingId: Scalars['ID']['output'];
  modifierIds: Array<Scalars['ID']['output']>;
  /** The line total in cents (unit price times quantity, options included), as ordering-service computed it. */
  price: Money;
  quantity: Scalars['Int']['output'];
};

/** One value per ordering-service OrderStatus; no states are introduced here. */
export type OrderStatus =
  | 'CANCELLED'
  | 'COMPLETED'
  | 'CONFIRMED'
  | 'IN_PREPARATION'
  | 'PENDING'
  | 'PLACED'
  | 'READY_FOR_FULFILLMENT';

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
};

/** A saved payment method. The id is ordering-service's own (not a global id); the description is free text the customer reads. Nothing else is exposed. */
export type PaymentMethod = {
  __typename?: 'PaymentMethod';
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
};

export type PersonalizedListing = {
  __typename?: 'PersonalizedListing';
  conflicts: Array<Conflict>;
  /** How the listing stands against each diet the caller prefers (WI-TAG-004). Empty when they prefer none. */
  dietMatches: Array<DietMatch>;
  listing: Listing;
};

export type PersonalizedListingConnection = {
  __typename?: 'PersonalizedListingConnection';
  edges: Array<PersonalizedListingEdge>;
  pageInfo: PageInfo;
};

export type PersonalizedListingEdge = {
  __typename?: 'PersonalizedListingEdge';
  cursor: Scalars['String']['output'];
  node: PersonalizedListing;
};

export type PickupWindow = {
  __typename?: 'PickupWindow';
  end: Scalars['DateTime']['output'];
  start: Scalars['DateTime']['output'];
};

export type PickupWindowInput = {
  end: Scalars['DateTime']['input'];
  start: Scalars['DateTime']['input'];
};

export type PlaceOrderErrorCode =
  /** The stock changed while the order was being placed; trying again is reasonable. */
  | 'CONFLICT'
  | 'INSUFFICIENT_STOCK'
  | 'INVALID_MODIFIER'
  | 'INVALID_QUANTITY'
  | 'LISTING_UNAVAILABLE'
  | 'PAYMENT_DECLINED'
  | 'PICKUP_WINDOW_UNAVAILABLE'
  /**
   * Ordering could not reach something it needs (the catalog, the payment processor or its store) and placed nothing; any stock it had taken was given
   * back. Try again in a moment with the SAME idempotency key: unlike the other codes, this attempt is not spent (register 165).
   */
  | 'TEMPORARILY_UNAVAILABLE'
  | 'VALIDATION_FAILED';

/** There is deliberately no price, total, customer or status here: ordering-service decides all of them. */
export type PlaceOrderInput = {
  /**
   * Optional (WI-ORD-009): the allergens the customer chooses to tell the bakery about for this order, as ids from the `tags` registry. Ordering-service
   * checks them against the registry (not against the customer's profile); the BFF validates nothing itself.
   */
  allergens?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Generated by the client when the checkout form opens; the same key with the same content returns the original order. */
  idempotencyKey: Scalars['String']['input'];
  lineItems: Array<LineItemInput>;
  /** One of the caller's `paymentMethods` (WI-ORD-010). Ordering-service refuses an id that is missing, unknown or someone else's with VALIDATION_FAILED on this field, and an invalid payment token with PAYMENT_DECLINED. */
  paymentMethodId: Scalars['ID']['input'];
  /** Optional (D-3). An order with no options and no window confirms itself. */
  pickupWindow?: InputMaybe<PickupWindowInput>;
  vendorId: Scalars['ID']['input'];
};

export type PlaceOrderPayload = PlaceOrderRejected | PlaceOrderSuccess;

/** An expected failure (first-slice contract section 6). The message is fixed client-safe text; the fields say which input to fix. */
export type PlaceOrderRejected = {
  __typename?: 'PlaceOrderRejected';
  code: PlaceOrderErrorCode;
  fields: Array<FieldProblem>;
  message: Scalars['String']['output'];
  /** Set for INSUFFICIENT_STOCK: each short item and how many can be bought. */
  shortfalls: Array<StockShortfall>;
};

export type PlaceOrderSuccess = {
  __typename?: 'PlaceOrderSuccess';
  order: Order;
};

/** The caller's allergen profile. Both lists hold allergen ids from the tag registry (the `tags` query); an allergen is in at most one list. */
export type Preferences = {
  __typename?: 'Preferences';
  /** Allergens the customer must avoid (serious). */
  allergies: Array<Scalars['ID']['output']>;
  /** Allergens the customer would rather avoid (a preference). */
  avoid: Array<Scalars['ID']['output']>;
  /** Diet tag ids the customer prefers (WI-TAG-004): the bakery's claims they would like to see. Not allergens; a preference never hides anything unless they ask. */
  prefer: Array<Scalars['ID']['output']>;
};

export type Query = {
  __typename?: 'Query';
  /**
   * Checks a cart against the caller's profile: for each line (in order) the conflicts of the item and of the options chosen on that line, and only
   * those. At most 50 lines of at most 20 options (BAD_INPUT otherwise). A line whose listing is not public is found: false, not an error.
   */
  cartCheck: Array<CartLineCheck>;
  listing?: Maybe<Listing>;
  /**
   * The public listings. With `tags` (ids from the `tags` query), only listings that carry ALL of them on the listing itself (a tag on an option does not select
   * the listing). Public and anonymous like the unfiltered list. An id that cannot be used to filter (unknown, hidden, retired, outside its window, an allergen, or
   * more than the limit) is refused with BAD_INPUT, the same for all of them.
   */
  listings: ListingConnection;
  node?: Maybe<Node>;
  /** The caller's own order. Null when it does not exist or is someone else's. Needs a bearer token (UNAUTHENTICATED without one). */
  order?: Maybe<Order>;
  /** The caller's own orders, the newest first (WI-CUST-007). Needs a customer's bearer token (UNAUTHENTICATED without one, FORBIDDEN for another role). Pass the connection's endCursor as after to read the next page. */
  orders: OrderConnection;
  /**
   * The caller's saved payment methods (WI-ORD-010), to choose one at checkout: an id and a description each, in the order ordering-service gives them
   * (the first is the one a checkout form preselects). There is deliberately no token, number, brand or expiry here. Needs a customer's bearer token
   * (UNAUTHENTICATED without one, FORBIDDEN for another role). A customer with none has an empty list.
   */
  paymentMethods: Array<PaymentMethod>;
  /** One public listing with the caller's conflicts, for the item and every option. Null when it does not exist or is not public. */
  personalizedListing?: Maybe<PersonalizedListing>;
  /**
   * The public listings with what in each conflicts with the caller's allergen profile (WI-SRCH-001), in the same order and with the same paging as
   * `listings`. hideConflicts leaves out listings whose item itself contains an allergen of the profile (a conflict only through an optional add-on
   * does not hide it). Needs a customer's bearer token (UNAUTHENTICATED without one, FORBIDDEN for another role). Private to the caller.
   */
  personalizedListings: PersonalizedListingConnection;
  /** The pickup windows checkout accepts right now. Public. */
  pickupWindows: Array<PickupWindow>;
  /**
   * The caller's own allergen profile (WI-PREF-001): quasi-health data, private to the caller. Needs a customer's bearer token (UNAUTHENTICATED
   * without one, FORBIDDEN for another role). A customer who never saved one has two empty lists.
   */
  preferences: Preferences;
  /** The tags the catalog offers today, optionally of one kind (ADR-0022). Public. Hidden tags and tags outside their window are not in it. */
  tags: Array<Tag>;
  /** One of the calling vendor's own orders. Null when it does not exist, is another vendor's, or has not reached the vendor's view yet. */
  vendorOrder?: Maybe<VendorOrder>;
  /** A vendor's own orders, the most recently changed first, optionally narrowed by status. Needs a vendor's bearer token (UNAUTHENTICATED without one, FORBIDDEN for another role). */
  vendorOrders: VendorOrderConnection;
};


export type QueryCartCheckArgs = {
  lines: Array<CartLineInput>;
};


export type QueryListingArgs = {
  id: Scalars['ID']['input'];
};


export type QueryListingsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  tags?: InputMaybe<Array<Scalars['ID']['input']>>;
};


export type QueryNodeArgs = {
  id: Scalars['ID']['input'];
};


export type QueryOrderArgs = {
  id: Scalars['ID']['input'];
};


export type QueryOrdersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryPersonalizedListingArgs = {
  id: Scalars['ID']['input'];
};


export type QueryPersonalizedListingsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  hideConflicts?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryPickupWindowsArgs = {
  vendorId: Scalars['ID']['input'];
};


export type QueryTagsArgs = {
  kind?: InputMaybe<TagKind>;
};


export type QueryVendorOrderArgs = {
  id: Scalars['ID']['input'];
};


export type QueryVendorOrdersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<VendorOrderFilter>;
};

export type SavePreferencesInput = {
  allergies: Array<Scalars['ID']['input']>;
  avoid: Array<Scalars['ID']['input']>;
  /** Optional: left out, the stored list stays as it was. */
  prefer?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type SavePreferencesPayload = SavePreferencesRejected | SavePreferencesSuccess;

/** An expected refusal (an id that is not on offer, a duplicate, an allergen in both lists). The message is fixed client-safe text; the fields say which list to fix. */
export type SavePreferencesRejected = {
  __typename?: 'SavePreferencesRejected';
  fields: Array<FieldProblem>;
  message: Scalars['String']['output'];
};

export type SavePreferencesSuccess = {
  __typename?: 'SavePreferencesSuccess';
  preferences: Preferences;
};

/** What a customer may know about availability (ADR-0017). Exact quantities are never public. */
export type Stock = {
  __typename?: 'Stock';
  /** The most a customer can buy in one order; null means no per-order limit beyond the global one. */
  maxPerOrder?: Maybe<Scalars['Int']['output']>;
  status: StockStatus;
};

export type StockShortfall = {
  __typename?: 'StockShortfall';
  available: Scalars['Int']['output'];
  /** A Listing global id. */
  listingId: Scalars['ID']['output'];
};

export type StockStatus =
  | 'IN_STOCK'
  | 'LOW'
  | 'SOLD_OUT';

/**
 * Live updates (ADR-0021). Needs a vendor's bearer token, like the vendor queries, and is served over Server-Sent Events (the graphql-sse
 * protocol, one request per subscription). The stream ends when the token expires or after an hour; the client then lists again and reconnects.
 * When live updates are unavailable the subscription fails and the screen keeps polling vendorOrders.
 */
export type Subscription = {
  __typename?: 'Subscription';
  /** The vendor's order whenever it changes, whole (the same shape the list returns). Nothing is replayed: list first, then apply these. */
  vendorOrderChanged: VendorOrder;
};

/** A tag from the catalog's registry. The id is the registry's own stable id (a slug such as `tree-nut`), not a global id; the label is for display. */
export type Tag = {
  __typename?: 'Tag';
  id: Scalars['ID']['output'];
  kind: TagKind;
  label: Scalars['String']['output'];
};

/** What a tag means (ADR-0022): an allergen is a warning, a diet is the vendor's claim, the rest describe. */
export type TagKind =
  | 'ALLERGEN'
  | 'DIET'
  | 'OCCASION'
  | 'SEASON'
  | 'THEME';

/**
 * An order as its vendor sees it (the vendor order read model of ordering-service). The customer is not named. Ids come from the order's events;
 * names come from ordering-service's cache of listing names and are null when the catalog could not say.
 */
export type VendorOrder = Node & {
  __typename?: 'VendorOrder';
  /**
   * The allergens the customer chose to tell the bakery about for this order (ids from the `tags` registry; the screen maps them to labels), for any
   * special handling, a label or separate staging. Only the vendor who has the order can read them.
   */
  allergens: Array<Scalars['String']['output']>;
  /** True when checkout confirmed the order by rule, so it never needed the vendor's decision. */
  automatic: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  itemCount?: Maybe<Scalars['Int']['output']>;
  lineCount?: Maybe<Scalars['Int']['output']>;
  lines: Array<VendorOrderLine>;
  pickupInstructions?: Maybe<Scalars['String']['output']>;
  /** The window the customer asked for, or the scheduled one once confirmed. Null when none was requested. */
  pickupWindow?: Maybe<PickupWindow>;
  placedAt?: Maybe<Scalars['DateTime']['output']>;
  /** A short code to read out or match on a screen, derived from the order id. Not unique. */
  reference: Scalars['String']['output'];
  /**
   * The highest event sequence number applied to this order. A screen holding an order replaces it with a pushed one only if this is higher,
   * so a late or repeated update never moves an order backwards.
   */
  sequence: Scalars['Int']['output'];
  status: OrderStatus;
  /** Null only for an order whose events pre-date the totals. */
  total?: Maybe<Money>;
  /** When the order last changed; the list is ordered by it. */
  updatedAt: Scalars['DateTime']['output'];
};

/** What a vendor can do to an order. Which of them is allowed from which status is ordering-service's rule, not a rule here. */
export type VendorOrderAction =
  /** Cancels an order the vendor has already accepted (ordering allows it from CONFIRMED, IN_PREPARATION and READY_FOR_FULFILLMENT). A new order is declined, not cancelled. */
  | 'CANCEL'
  | 'COMPLETE'
  | 'CONFIRM'
  | 'DECLINE'
  | 'MARK_READY'
  | 'START_PREPARATION';

export type VendorOrderActionDone = {
  __typename?: 'VendorOrderActionDone';
  /** The VendorOrder global id the action was sent for. */
  orderId: Scalars['ID']['output'];
  /** The order's status after the action. For COMPLETE it is the status when the request was accepted (still READY_FOR_FULFILLMENT): a fulfillment strategy completes the order moments later, and the queue learns of it from the stream or the list. */
  status: OrderStatus;
};

export type VendorOrderActionInput = {
  action: VendorOrderAction;
  /** A VendorOrder global id. */
  orderId: Scalars['ID']['input'];
};

export type VendorOrderActionPayload = VendorOrderActionDone | VendorOrderActionRejected;

/** An expected refusal. The message is fixed client-safe text. */
export type VendorOrderActionRejected = {
  __typename?: 'VendorOrderActionRejected';
  code: VendorOrderActionRejectionCode;
  /** For NOT_ALLOWED_NOW: where the order is now, when ordering said. */
  currentStatus?: Maybe<OrderStatus>;
  message: Scalars['String']['output'];
};

export type VendorOrderActionRejectionCode =
  /** The order's status does not allow this action now. */
  | 'NOT_ALLOWED_NOW'
  /** No such order for this vendor (a missing and another vendor's order look the same). */
  | 'NOT_FOUND';

export type VendorOrderConnection = {
  __typename?: 'VendorOrderConnection';
  edges: Array<VendorOrderEdge>;
  pageInfo: PageInfo;
};

export type VendorOrderEdge = {
  __typename?: 'VendorOrderEdge';
  cursor: Scalars['String']['output'];
  node: VendorOrder;
};

/** Which of a vendor's orders to list: the ones still in progress, or one status. */
export type VendorOrderFilter =
  | 'ACTIVE'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'CONFIRMED'
  | 'IN_PREPARATION'
  | 'PLACED'
  | 'READY_FOR_FULFILLMENT';

export type VendorOrderLine = {
  __typename?: 'VendorOrderLine';
  /** A Listing global id. */
  listingId: Scalars['ID']['output'];
  listingName?: Maybe<Scalars['String']['output']>;
  modifiers: Array<VendorOrderModifier>;
  quantity: Scalars['Int']['output'];
};

export type VendorOrderModifier = {
  __typename?: 'VendorOrderModifier';
  id: Scalars['ID']['output'];
  name?: Maybe<Scalars['String']['output']>;
};



export type ResolverTypeWrapper<T> = Promise<T> | T;

export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;



/** Mapping of union types */
export type ResolversUnionTypes<_RefType extends Record<string, unknown>> = {
  CancelOrderPayload:
    | ( CancelOrderDone )
    | ( CancelOrderRejected )
  ;
  PlaceOrderPayload:
    | ( PlaceOrderRejected )
    | ( PlaceOrderSuccess )
  ;
  SavePreferencesPayload:
    | ( SavePreferencesRejected )
    | ( SavePreferencesSuccess )
  ;
  VendorOrderActionPayload:
    | ( VendorOrderActionDone )
    | ( VendorOrderActionRejected )
  ;
};

/** Mapping of interface types */
export type ResolversInterfaceTypes<_RefType extends Record<string, unknown>> = {
  Node:
    | ( Listing )
    | ( Order )
    | ( VendorOrder )
  ;
};

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  CancelOrderDone: ResolverTypeWrapper<CancelOrderDone>;
  CancelOrderInput: CancelOrderInput;
  CancelOrderPayload: ResolverTypeWrapper<ResolversUnionTypes<ResolversTypes>['CancelOrderPayload']>;
  CancelOrderRejected: ResolverTypeWrapper<CancelOrderRejected>;
  CancelOrderRejectionCode: CancelOrderRejectionCode;
  CartLineCheck: ResolverTypeWrapper<CartLineCheck>;
  CartLineInput: CartLineInput;
  Conflict: ResolverTypeWrapper<Conflict>;
  ConflictSeverity: ConflictSeverity;
  ConflictSource: ConflictSource;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>;
  DietMatch: ResolverTypeWrapper<DietMatch>;
  FieldProblem: ResolverTypeWrapper<FieldProblem>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  LineItemInput: LineItemInput;
  Listing: ResolverTypeWrapper<Listing>;
  ListingConnection: ResolverTypeWrapper<ListingConnection>;
  ListingEdge: ResolverTypeWrapper<ListingEdge>;
  Modifier: ResolverTypeWrapper<Modifier>;
  Money: ResolverTypeWrapper<Money>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Node: ResolverTypeWrapper<ResolversInterfaceTypes<ResolversTypes>['Node']>;
  Order: ResolverTypeWrapper<Order>;
  OrderConnection: ResolverTypeWrapper<OrderConnection>;
  OrderEdge: ResolverTypeWrapper<OrderEdge>;
  OrderLineItem: ResolverTypeWrapper<OrderLineItem>;
  OrderStatus: OrderStatus;
  PageInfo: ResolverTypeWrapper<PageInfo>;
  PaymentMethod: ResolverTypeWrapper<PaymentMethod>;
  PersonalizedListing: ResolverTypeWrapper<PersonalizedListing>;
  PersonalizedListingConnection: ResolverTypeWrapper<PersonalizedListingConnection>;
  PersonalizedListingEdge: ResolverTypeWrapper<PersonalizedListingEdge>;
  PickupWindow: ResolverTypeWrapper<PickupWindow>;
  PickupWindowInput: PickupWindowInput;
  PlaceOrderErrorCode: PlaceOrderErrorCode;
  PlaceOrderInput: PlaceOrderInput;
  PlaceOrderPayload: ResolverTypeWrapper<ResolversUnionTypes<ResolversTypes>['PlaceOrderPayload']>;
  PlaceOrderRejected: ResolverTypeWrapper<PlaceOrderRejected>;
  PlaceOrderSuccess: ResolverTypeWrapper<PlaceOrderSuccess>;
  Preferences: ResolverTypeWrapper<Preferences>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  SavePreferencesInput: SavePreferencesInput;
  SavePreferencesPayload: ResolverTypeWrapper<ResolversUnionTypes<ResolversTypes>['SavePreferencesPayload']>;
  SavePreferencesRejected: ResolverTypeWrapper<SavePreferencesRejected>;
  SavePreferencesSuccess: ResolverTypeWrapper<SavePreferencesSuccess>;
  Stock: ResolverTypeWrapper<Stock>;
  StockShortfall: ResolverTypeWrapper<StockShortfall>;
  StockStatus: StockStatus;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Subscription: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Tag: ResolverTypeWrapper<Tag>;
  TagKind: TagKind;
  VendorOrder: ResolverTypeWrapper<VendorOrder>;
  VendorOrderAction: VendorOrderAction;
  VendorOrderActionDone: ResolverTypeWrapper<VendorOrderActionDone>;
  VendorOrderActionInput: VendorOrderActionInput;
  VendorOrderActionPayload: ResolverTypeWrapper<ResolversUnionTypes<ResolversTypes>['VendorOrderActionPayload']>;
  VendorOrderActionRejected: ResolverTypeWrapper<VendorOrderActionRejected>;
  VendorOrderActionRejectionCode: VendorOrderActionRejectionCode;
  VendorOrderConnection: ResolverTypeWrapper<VendorOrderConnection>;
  VendorOrderEdge: ResolverTypeWrapper<VendorOrderEdge>;
  VendorOrderFilter: VendorOrderFilter;
  VendorOrderLine: ResolverTypeWrapper<VendorOrderLine>;
  VendorOrderModifier: ResolverTypeWrapper<VendorOrderModifier>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Boolean: Scalars['Boolean']['output'];
  CancelOrderDone: CancelOrderDone;
  CancelOrderInput: CancelOrderInput;
  CancelOrderPayload: ResolversUnionTypes<ResolversParentTypes>['CancelOrderPayload'];
  CancelOrderRejected: CancelOrderRejected;
  CartLineCheck: CartLineCheck;
  CartLineInput: CartLineInput;
  Conflict: Conflict;
  DateTime: Scalars['DateTime']['output'];
  DietMatch: DietMatch;
  FieldProblem: FieldProblem;
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  LineItemInput: LineItemInput;
  Listing: Listing;
  ListingConnection: ListingConnection;
  ListingEdge: ListingEdge;
  Modifier: Modifier;
  Money: Money;
  Mutation: Record<PropertyKey, never>;
  Node: ResolversInterfaceTypes<ResolversParentTypes>['Node'];
  Order: Order;
  OrderConnection: OrderConnection;
  OrderEdge: OrderEdge;
  OrderLineItem: OrderLineItem;
  PageInfo: PageInfo;
  PaymentMethod: PaymentMethod;
  PersonalizedListing: PersonalizedListing;
  PersonalizedListingConnection: PersonalizedListingConnection;
  PersonalizedListingEdge: PersonalizedListingEdge;
  PickupWindow: PickupWindow;
  PickupWindowInput: PickupWindowInput;
  PlaceOrderInput: PlaceOrderInput;
  PlaceOrderPayload: ResolversUnionTypes<ResolversParentTypes>['PlaceOrderPayload'];
  PlaceOrderRejected: PlaceOrderRejected;
  PlaceOrderSuccess: PlaceOrderSuccess;
  Preferences: Preferences;
  Query: Record<PropertyKey, never>;
  SavePreferencesInput: SavePreferencesInput;
  SavePreferencesPayload: ResolversUnionTypes<ResolversParentTypes>['SavePreferencesPayload'];
  SavePreferencesRejected: SavePreferencesRejected;
  SavePreferencesSuccess: SavePreferencesSuccess;
  Stock: Stock;
  StockShortfall: StockShortfall;
  String: Scalars['String']['output'];
  Subscription: Record<PropertyKey, never>;
  Tag: Tag;
  VendorOrder: VendorOrder;
  VendorOrderActionDone: VendorOrderActionDone;
  VendorOrderActionInput: VendorOrderActionInput;
  VendorOrderActionPayload: ResolversUnionTypes<ResolversParentTypes>['VendorOrderActionPayload'];
  VendorOrderActionRejected: VendorOrderActionRejected;
  VendorOrderConnection: VendorOrderConnection;
  VendorOrderEdge: VendorOrderEdge;
  VendorOrderLine: VendorOrderLine;
  VendorOrderModifier: VendorOrderModifier;
};

export type CancelOrderDoneResolvers<ContextType = Context, ParentType extends ResolversParentTypes['CancelOrderDone'] = ResolversParentTypes['CancelOrderDone']> = {
  orderId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['OrderStatus'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CancelOrderPayloadResolvers<ContextType = Context, ParentType extends ResolversParentTypes['CancelOrderPayload'] = ResolversParentTypes['CancelOrderPayload']> = {
  __resolveType: TypeResolveFn<'CancelOrderDone' | 'CancelOrderRejected', ParentType, ContextType>;
};

export type CancelOrderRejectedResolvers<ContextType = Context, ParentType extends ResolversParentTypes['CancelOrderRejected'] = ResolversParentTypes['CancelOrderRejected']> = {
  code?: Resolver<ResolversTypes['CancelOrderRejectionCode'], ParentType, ContextType>;
  currentStatus?: Resolver<Maybe<ResolversTypes['OrderStatus']>, ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CartLineCheckResolvers<ContextType = Context, ParentType extends ResolversParentTypes['CartLineCheck'] = ResolversParentTypes['CartLineCheck']> = {
  conflicts?: Resolver<Array<ResolversTypes['Conflict']>, ParentType, ContextType>;
  dietMatches?: Resolver<Array<ResolversTypes['DietMatch']>, ParentType, ContextType>;
  found?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  listingId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  unknownOptionIds?: Resolver<Array<ResolversTypes['ID']>, ParentType, ContextType>;
};

export type ConflictResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Conflict'] = ResolversParentTypes['Conflict']> = {
  allergenId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  optionIds?: Resolver<Array<ResolversTypes['ID']>, ParentType, ContextType>;
  severity?: Resolver<ResolversTypes['ConflictSeverity'], ParentType, ContextType>;
  source?: Resolver<ResolversTypes['ConflictSource'], ParentType, ContextType>;
};

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export type DietMatchResolvers<ContextType = Context, ParentType extends ResolversParentTypes['DietMatch'] = ResolversParentTypes['DietMatch']> = {
  itemMarked?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  marked?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  optionIdsNotMarked?: Resolver<Array<ResolversTypes['ID']>, ParentType, ContextType>;
  tagId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type FieldProblemResolvers<ContextType = Context, ParentType extends ResolversParentTypes['FieldProblem'] = ResolversParentTypes['FieldProblem']> = {
  field?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ListingResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Listing'] = ResolversParentTypes['Listing']> = {
  allergenFlags?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  category?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  modifiers?: Resolver<Array<ResolversTypes['Modifier']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  price?: Resolver<ResolversTypes['Money'], ParentType, ContextType>;
  stock?: Resolver<ResolversTypes['Stock'], ParentType, ContextType>;
  tags?: Resolver<Array<ResolversTypes['Tag']>, ParentType, ContextType>;
  vendorId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ListingConnectionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ListingConnection'] = ResolversParentTypes['ListingConnection']> = {
  edges?: Resolver<Array<ResolversTypes['ListingEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
};

export type ListingEdgeResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ListingEdge'] = ResolversParentTypes['ListingEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['Listing'], ParentType, ContextType>;
};

export type ModifierResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Modifier'] = ResolversParentTypes['Modifier']> = {
  allergens?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  priceDelta?: Resolver<ResolversTypes['Money'], ParentType, ContextType>;
  tags?: Resolver<Array<ResolversTypes['Tag']>, ParentType, ContextType>;
};

export type MoneyResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Money'] = ResolversParentTypes['Money']> = {
  cents?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  currency?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type MutationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  cancelOrder?: Resolver<ResolversTypes['CancelOrderPayload'], ParentType, ContextType, RequireFields<MutationCancelOrderArgs, 'input'>>;
  placeOrder?: Resolver<ResolversTypes['PlaceOrderPayload'], ParentType, ContextType, RequireFields<MutationPlaceOrderArgs, 'input'>>;
  savePreferences?: Resolver<ResolversTypes['SavePreferencesPayload'], ParentType, ContextType, RequireFields<MutationSavePreferencesArgs, 'input'>>;
  vendorOrderAction?: Resolver<ResolversTypes['VendorOrderActionPayload'], ParentType, ContextType, RequireFields<MutationVendorOrderActionArgs, 'input'>>;
};

export type NodeResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Node'] = ResolversParentTypes['Node']> = {
  __resolveType: TypeResolveFn<'Listing' | 'Order' | 'VendorOrder', ParentType, ContextType>;
};

export type OrderResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Order'] = ResolversParentTypes['Order']> = {
  allergens?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  lineItems?: Resolver<Array<ResolversTypes['OrderLineItem']>, ParentType, ContextType>;
  pickupWindow?: Resolver<Maybe<ResolversTypes['PickupWindow']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['OrderStatus'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Money'], ParentType, ContextType>;
  vendorId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type OrderConnectionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['OrderConnection'] = ResolversParentTypes['OrderConnection']> = {
  edges?: Resolver<Array<ResolversTypes['OrderEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
};

export type OrderEdgeResolvers<ContextType = Context, ParentType extends ResolversParentTypes['OrderEdge'] = ResolversParentTypes['OrderEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['Order'], ParentType, ContextType>;
};

export type OrderLineItemResolvers<ContextType = Context, ParentType extends ResolversParentTypes['OrderLineItem'] = ResolversParentTypes['OrderLineItem']> = {
  listingId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  modifierIds?: Resolver<Array<ResolversTypes['ID']>, ParentType, ContextType>;
  price?: Resolver<ResolversTypes['Money'], ParentType, ContextType>;
  quantity?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type PageInfoResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PageInfo'] = ResolversParentTypes['PageInfo']> = {
  endCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
};

export type PaymentMethodResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PaymentMethod'] = ResolversParentTypes['PaymentMethod']> = {
  description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type PersonalizedListingResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PersonalizedListing'] = ResolversParentTypes['PersonalizedListing']> = {
  conflicts?: Resolver<Array<ResolversTypes['Conflict']>, ParentType, ContextType>;
  dietMatches?: Resolver<Array<ResolversTypes['DietMatch']>, ParentType, ContextType>;
  listing?: Resolver<ResolversTypes['Listing'], ParentType, ContextType>;
};

export type PersonalizedListingConnectionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PersonalizedListingConnection'] = ResolversParentTypes['PersonalizedListingConnection']> = {
  edges?: Resolver<Array<ResolversTypes['PersonalizedListingEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
};

export type PersonalizedListingEdgeResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PersonalizedListingEdge'] = ResolversParentTypes['PersonalizedListingEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['PersonalizedListing'], ParentType, ContextType>;
};

export type PickupWindowResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PickupWindow'] = ResolversParentTypes['PickupWindow']> = {
  end?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  start?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type PlaceOrderPayloadResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PlaceOrderPayload'] = ResolversParentTypes['PlaceOrderPayload']> = {
  __resolveType: TypeResolveFn<'PlaceOrderRejected' | 'PlaceOrderSuccess', ParentType, ContextType>;
};

export type PlaceOrderRejectedResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PlaceOrderRejected'] = ResolversParentTypes['PlaceOrderRejected']> = {
  code?: Resolver<ResolversTypes['PlaceOrderErrorCode'], ParentType, ContextType>;
  fields?: Resolver<Array<ResolversTypes['FieldProblem']>, ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  shortfalls?: Resolver<Array<ResolversTypes['StockShortfall']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PlaceOrderSuccessResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PlaceOrderSuccess'] = ResolversParentTypes['PlaceOrderSuccess']> = {
  order?: Resolver<ResolversTypes['Order'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PreferencesResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Preferences'] = ResolversParentTypes['Preferences']> = {
  allergies?: Resolver<Array<ResolversTypes['ID']>, ParentType, ContextType>;
  avoid?: Resolver<Array<ResolversTypes['ID']>, ParentType, ContextType>;
  prefer?: Resolver<Array<ResolversTypes['ID']>, ParentType, ContextType>;
};

export type QueryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  cartCheck?: Resolver<Array<ResolversTypes['CartLineCheck']>, ParentType, ContextType, RequireFields<QueryCartCheckArgs, 'lines'>>;
  listing?: Resolver<Maybe<ResolversTypes['Listing']>, ParentType, ContextType, RequireFields<QueryListingArgs, 'id'>>;
  listings?: Resolver<ResolversTypes['ListingConnection'], ParentType, ContextType, RequireFields<QueryListingsArgs, 'first'>>;
  node?: Resolver<Maybe<ResolversTypes['Node']>, ParentType, ContextType, RequireFields<QueryNodeArgs, 'id'>>;
  order?: Resolver<Maybe<ResolversTypes['Order']>, ParentType, ContextType, RequireFields<QueryOrderArgs, 'id'>>;
  orders?: Resolver<ResolversTypes['OrderConnection'], ParentType, ContextType, RequireFields<QueryOrdersArgs, 'first'>>;
  paymentMethods?: Resolver<Array<ResolversTypes['PaymentMethod']>, ParentType, ContextType>;
  personalizedListing?: Resolver<Maybe<ResolversTypes['PersonalizedListing']>, ParentType, ContextType, RequireFields<QueryPersonalizedListingArgs, 'id'>>;
  personalizedListings?: Resolver<ResolversTypes['PersonalizedListingConnection'], ParentType, ContextType, RequireFields<QueryPersonalizedListingsArgs, 'first' | 'hideConflicts'>>;
  pickupWindows?: Resolver<Array<ResolversTypes['PickupWindow']>, ParentType, ContextType, RequireFields<QueryPickupWindowsArgs, 'vendorId'>>;
  preferences?: Resolver<ResolversTypes['Preferences'], ParentType, ContextType>;
  tags?: Resolver<Array<ResolversTypes['Tag']>, ParentType, ContextType, Partial<QueryTagsArgs>>;
  vendorOrder?: Resolver<Maybe<ResolversTypes['VendorOrder']>, ParentType, ContextType, RequireFields<QueryVendorOrderArgs, 'id'>>;
  vendorOrders?: Resolver<ResolversTypes['VendorOrderConnection'], ParentType, ContextType, RequireFields<QueryVendorOrdersArgs, 'first'>>;
};

export type SavePreferencesPayloadResolvers<ContextType = Context, ParentType extends ResolversParentTypes['SavePreferencesPayload'] = ResolversParentTypes['SavePreferencesPayload']> = {
  __resolveType: TypeResolveFn<'SavePreferencesRejected' | 'SavePreferencesSuccess', ParentType, ContextType>;
};

export type SavePreferencesRejectedResolvers<ContextType = Context, ParentType extends ResolversParentTypes['SavePreferencesRejected'] = ResolversParentTypes['SavePreferencesRejected']> = {
  fields?: Resolver<Array<ResolversTypes['FieldProblem']>, ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SavePreferencesSuccessResolvers<ContextType = Context, ParentType extends ResolversParentTypes['SavePreferencesSuccess'] = ResolversParentTypes['SavePreferencesSuccess']> = {
  preferences?: Resolver<ResolversTypes['Preferences'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type StockResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Stock'] = ResolversParentTypes['Stock']> = {
  maxPerOrder?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['StockStatus'], ParentType, ContextType>;
};

export type StockShortfallResolvers<ContextType = Context, ParentType extends ResolversParentTypes['StockShortfall'] = ResolversParentTypes['StockShortfall']> = {
  available?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  listingId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type SubscriptionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Subscription'] = ResolversParentTypes['Subscription']> = {
  vendorOrderChanged?: SubscriptionResolver<ResolversTypes['VendorOrder'], "vendorOrderChanged", ParentType, ContextType>;
};

export type TagResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Tag'] = ResolversParentTypes['Tag']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  kind?: Resolver<ResolversTypes['TagKind'], ParentType, ContextType>;
  label?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type VendorOrderResolvers<ContextType = Context, ParentType extends ResolversParentTypes['VendorOrder'] = ResolversParentTypes['VendorOrder']> = {
  allergens?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  automatic?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  itemCount?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  lineCount?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  lines?: Resolver<Array<ResolversTypes['VendorOrderLine']>, ParentType, ContextType>;
  pickupInstructions?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  pickupWindow?: Resolver<Maybe<ResolversTypes['PickupWindow']>, ParentType, ContextType>;
  placedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  reference?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  sequence?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['OrderStatus'], ParentType, ContextType>;
  total?: Resolver<Maybe<ResolversTypes['Money']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type VendorOrderActionDoneResolvers<ContextType = Context, ParentType extends ResolversParentTypes['VendorOrderActionDone'] = ResolversParentTypes['VendorOrderActionDone']> = {
  orderId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['OrderStatus'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type VendorOrderActionPayloadResolvers<ContextType = Context, ParentType extends ResolversParentTypes['VendorOrderActionPayload'] = ResolversParentTypes['VendorOrderActionPayload']> = {
  __resolveType: TypeResolveFn<'VendorOrderActionDone' | 'VendorOrderActionRejected', ParentType, ContextType>;
};

export type VendorOrderActionRejectedResolvers<ContextType = Context, ParentType extends ResolversParentTypes['VendorOrderActionRejected'] = ResolversParentTypes['VendorOrderActionRejected']> = {
  code?: Resolver<ResolversTypes['VendorOrderActionRejectionCode'], ParentType, ContextType>;
  currentStatus?: Resolver<Maybe<ResolversTypes['OrderStatus']>, ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type VendorOrderConnectionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['VendorOrderConnection'] = ResolversParentTypes['VendorOrderConnection']> = {
  edges?: Resolver<Array<ResolversTypes['VendorOrderEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
};

export type VendorOrderEdgeResolvers<ContextType = Context, ParentType extends ResolversParentTypes['VendorOrderEdge'] = ResolversParentTypes['VendorOrderEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['VendorOrder'], ParentType, ContextType>;
};

export type VendorOrderLineResolvers<ContextType = Context, ParentType extends ResolversParentTypes['VendorOrderLine'] = ResolversParentTypes['VendorOrderLine']> = {
  listingId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  listingName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  modifiers?: Resolver<Array<ResolversTypes['VendorOrderModifier']>, ParentType, ContextType>;
  quantity?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type VendorOrderModifierResolvers<ContextType = Context, ParentType extends ResolversParentTypes['VendorOrderModifier'] = ResolversParentTypes['VendorOrderModifier']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type Resolvers<ContextType = Context> = {
  CancelOrderDone?: CancelOrderDoneResolvers<ContextType>;
  CancelOrderPayload?: CancelOrderPayloadResolvers<ContextType>;
  CancelOrderRejected?: CancelOrderRejectedResolvers<ContextType>;
  CartLineCheck?: CartLineCheckResolvers<ContextType>;
  Conflict?: ConflictResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  DietMatch?: DietMatchResolvers<ContextType>;
  FieldProblem?: FieldProblemResolvers<ContextType>;
  Listing?: ListingResolvers<ContextType>;
  ListingConnection?: ListingConnectionResolvers<ContextType>;
  ListingEdge?: ListingEdgeResolvers<ContextType>;
  Modifier?: ModifierResolvers<ContextType>;
  Money?: MoneyResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  Node?: NodeResolvers<ContextType>;
  Order?: OrderResolvers<ContextType>;
  OrderConnection?: OrderConnectionResolvers<ContextType>;
  OrderEdge?: OrderEdgeResolvers<ContextType>;
  OrderLineItem?: OrderLineItemResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  PaymentMethod?: PaymentMethodResolvers<ContextType>;
  PersonalizedListing?: PersonalizedListingResolvers<ContextType>;
  PersonalizedListingConnection?: PersonalizedListingConnectionResolvers<ContextType>;
  PersonalizedListingEdge?: PersonalizedListingEdgeResolvers<ContextType>;
  PickupWindow?: PickupWindowResolvers<ContextType>;
  PlaceOrderPayload?: PlaceOrderPayloadResolvers<ContextType>;
  PlaceOrderRejected?: PlaceOrderRejectedResolvers<ContextType>;
  PlaceOrderSuccess?: PlaceOrderSuccessResolvers<ContextType>;
  Preferences?: PreferencesResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  SavePreferencesPayload?: SavePreferencesPayloadResolvers<ContextType>;
  SavePreferencesRejected?: SavePreferencesRejectedResolvers<ContextType>;
  SavePreferencesSuccess?: SavePreferencesSuccessResolvers<ContextType>;
  Stock?: StockResolvers<ContextType>;
  StockShortfall?: StockShortfallResolvers<ContextType>;
  Subscription?: SubscriptionResolvers<ContextType>;
  Tag?: TagResolvers<ContextType>;
  VendorOrder?: VendorOrderResolvers<ContextType>;
  VendorOrderActionDone?: VendorOrderActionDoneResolvers<ContextType>;
  VendorOrderActionPayload?: VendorOrderActionPayloadResolvers<ContextType>;
  VendorOrderActionRejected?: VendorOrderActionRejectedResolvers<ContextType>;
  VendorOrderConnection?: VendorOrderConnectionResolvers<ContextType>;
  VendorOrderEdge?: VendorOrderEdgeResolvers<ContextType>;
  VendorOrderLine?: VendorOrderLineResolvers<ContextType>;
  VendorOrderModifier?: VendorOrderModifierResolvers<ContextType>;
};


import { GraphQLError, Kind, NoSchemaIntrospectionCustomRule, specifiedRules } from 'graphql';
import type {
  DocumentNode,
  FragmentDefinitionNode,
  SelectionSetNode,
  ValidationContext,
  ValidationRule,
} from 'graphql';

// Limits on the size of an operation (register item 135, WI-SEC-005). The BFF's body limit (64 KB) bounds the text, but within it one operation can
// ask for the same field under many aliases (each root field is a call to a service) or nest deeply. These rules are checked by validation, so an
// operation over a limit is refused before anything is resolved or called. The schema is small; the limits are set well above what the apps ask for
// and far below what a 64 KB body can hold.

export interface OperationLimits {
  /** The deepest nesting of fields, counting the root field as 1. */
  maxDepth: number;
  /** The most fields directly under the operation (each is a call to a service). */
  maxRootFields: number;
  /** The most fields in all, fragments counted each time they are used. */
  maxFields: number;
  /** Refuse `__schema` and `__type`; for a deployed environment (`BFF_DISABLE_INTROSPECTION=1`). */
  disableIntrospection: boolean;
}

export const DEFAULT_LIMITS: OperationLimits = {
  maxDepth: 10,
  maxRootFields: 8,
  maxFields: 200,
  disableIntrospection: false,
};

export const TOO_COMPLEX_MESSAGE = 'This operation is too large or too deeply nested.';

const CAP = 1_000_000_000; // a fragment that expands into itself many times over would otherwise count into the trillions

interface Measure {
  depth: number;
  fields: number;
}

/** Depth and field count of a selection set, expanding fragment spreads. A fragment is measured once (memo); a cycle counts as nothing. */
function measure(
  set: SelectionSetNode,
  fragments: Map<string, FragmentDefinitionNode>,
  memo: Map<string, Measure>,
  inProgress: Set<string>,
): Measure {
  let depth = 0;
  let fields = 0;
  for (const selection of set.selections) {
    if (selection.kind === Kind.FIELD) {
      const inner = selection.selectionSet
        ? measure(selection.selectionSet, fragments, memo, inProgress)
        : { depth: 0, fields: 0 };
      depth = Math.max(depth, 1 + inner.depth);
      fields = Math.min(CAP, fields + 1 + inner.fields);
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      const inner = measure(selection.selectionSet, fragments, memo, inProgress);
      depth = Math.max(depth, inner.depth);
      fields = Math.min(CAP, fields + inner.fields);
    } else {
      const name = selection.name.value;
      const definition = fragments.get(name);
      if (!definition || inProgress.has(name)) continue; // unknown or cyclic: the standard rules report it
      let inner = memo.get(name);
      if (!inner) {
        inProgress.add(name);
        inner = measure(definition.selectionSet, fragments, memo, inProgress);
        inProgress.delete(name);
        memo.set(name, inner);
      }
      depth = Math.max(depth, inner.depth);
      fields = Math.min(CAP, fields + inner.fields);
    }
  }
  return { depth, fields };
}

/** The fields directly under a selection set, through inline fragments and spreads (a spread is counted once per use; a fragment is measured once). */
function rootFieldCount(
  set: SelectionSetNode,
  fragments: Map<string, FragmentDefinitionNode>,
  memo: Map<string, number>,
  inProgress: Set<string>,
): number {
  let count = 0;
  for (const selection of set.selections) {
    if (selection.kind === Kind.FIELD) count = Math.min(CAP, count + 1);
    else if (selection.kind === Kind.INLINE_FRAGMENT)
      count = Math.min(CAP, count + rootFieldCount(selection.selectionSet, fragments, memo, inProgress));
    else {
      const name = selection.name.value;
      const definition = fragments.get(name);
      if (!definition || inProgress.has(name)) continue;
      let inner = memo.get(name);
      if (inner === undefined) {
        inProgress.add(name);
        inner = rootFieldCount(definition.selectionSet, fragments, memo, inProgress);
        inProgress.delete(name);
        memo.set(name, inner);
      }
      count = Math.min(CAP, count + inner);
    }
  }
  return count;
}

/** How big each operation in the document is. Exported for the tests. */
export function operationSizes(
  document: DocumentNode,
): { name: string | null; depth: number; rootFields: number; fields: number }[] {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const d of document.definitions) if (d.kind === Kind.FRAGMENT_DEFINITION) fragments.set(d.name.value, d);
  const memo = new Map<string, Measure>();
  const rootMemo = new Map<string, number>();
  const sizes = [];
  for (const d of document.definitions) {
    if (d.kind !== Kind.OPERATION_DEFINITION) continue;
    const m = measure(d.selectionSet, fragments, memo, new Set());
    const rootFields = rootFieldCount(d.selectionSet, fragments, rootMemo, new Set());
    sizes.push({ name: d.name?.value ?? null, depth: m.depth, rootFields, fields: m.fields });
  }
  return sizes;
}

/** The validation rule for the limits. One error per operation that is over, with fixed text (no number, no field name). */
export function operationLimitsRule(limits: OperationLimits): ValidationRule {
  return (context: ValidationContext) => ({
    Document(node) {
      for (const size of operationSizes(node)) {
        if (size.depth > limits.maxDepth || size.rootFields > limits.maxRootFields || size.fields > limits.maxFields) {
          context.reportError(new GraphQLError(TOO_COMPLEX_MESSAGE, { extensions: { code: 'OPERATION_TOO_COMPLEX' } }));
          return;
        }
      }
    },
  });
}

/** The rules to validate an operation with: the standard ones, the size limits, and (when asked) no introspection. */
export function validationRules(limits: OperationLimits): readonly ValidationRule[] {
  return [
    ...specifiedRules,
    operationLimitsRule(limits),
    ...(limits.disableIntrospection ? [NoSchemaIntrospectionCustomRule] : []),
  ];
}

/** The limits from the environment. A bad number stops the start and names the variable only. */
export function limitsFromEnv(env: NodeJS.ProcessEnv): OperationLimits {
  const read = (name: string, fallback: number): number => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    if (!/^\d{1,5}$/.test(raw.trim()) || Number(raw) < 1)
      throw new Error(`${name} must be a whole number from 1 to 99999`);
    return Number(raw);
  };
  return {
    maxDepth: read('BFF_MAX_QUERY_DEPTH', DEFAULT_LIMITS.maxDepth),
    maxRootFields: read('BFF_MAX_ROOT_FIELDS', DEFAULT_LIMITS.maxRootFields),
    maxFields: read('BFF_MAX_FIELDS', DEFAULT_LIMITS.maxFields),
    disableIntrospection: env.BFF_DISABLE_INTROSPECTION === '1',
  };
}

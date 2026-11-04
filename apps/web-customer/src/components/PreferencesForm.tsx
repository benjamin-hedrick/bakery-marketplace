import { useCallback, useEffect, useState } from 'react';
import { graphql, useMutation, useRelayEnvironment } from 'react-relay';
import { fetchQuery } from 'relay-runtime';
import type { PreferencesFormMutation } from '../__generated__/PreferencesFormMutation.graphql';
import type { PreferencesFormQuery } from '../__generated__/PreferencesFormQuery.graphql';
import { GraphQLRequestError, UnauthenticatedError } from '../lib/relay/environment';

const profileQuery = graphql`
  query PreferencesFormQuery {
    tags(kind: ALLERGEN) {
      id
      label
    }
    preferences {
      allergies
      avoid
    }
  }
`;

const saveMutation = graphql`
  mutation PreferencesFormMutation($input: SavePreferencesInput!) {
    savePreferences(input: $input) {
      __typename
      ... on SavePreferencesSuccess {
        preferences {
          allergies
          avoid
        }
      }
      ... on SavePreferencesRejected {
        message
        fields {
          field
          message
        }
      }
    }
  }
`;

type Choice = 'none' | 'avoid' | 'allergy';
type Choices = Readonly<Record<string, Choice>>;
type Allergen = { id: string; label: string };
type Load =
  { state: 'loading' } | { state: 'failed' } | { state: 'ready'; allergens: readonly Allergen[]; saved: Choices };
type Outcome =
  { kind: 'saved' } | { kind: 'rejected'; message: string } | { kind: 'error'; reference?: string | undefined };

const OPTIONS: readonly { value: Choice; label: string; hint: string }[] = [
  { value: 'none', label: 'Not set', hint: '' },
  { value: 'avoid', label: 'Avoid', hint: 'I would rather avoid it' },
  { value: 'allergy', label: 'Allergy', hint: 'Serious: I must avoid it' },
];

const same = (a: Choices, b: Choices) =>
  Object.keys({ ...a, ...b }).every((id) => (a[id] ?? 'none') === (b[id] ?? 'none'));

/**
 * The customer's allergen profile (WI-CUST-005): one choice per allergen of the catalog's registry, saved as a whole. Read from the network only and
 * kept in this component, so nothing about the customer reaches the server HTML or the next person on the device. The wording never says an item is
 * safe: the bakery marks what it knows, and an unmarked item is not a guarantee.
 */
export function PreferencesForm() {
  const environment = useRelayEnvironment();
  const [commit, saving] = useMutation<PreferencesFormMutation>(saveMutation);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [choices, setChoices] = useState<Choices>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const read = useCallback(() => {
    fetchQuery<PreferencesFormQuery>(environment, profileQuery, {}, { fetchPolicy: 'network-only' })
      .toPromise()
      .then((data) => {
        if (!data) return setLoad({ state: 'failed' });
        const saved: Record<string, Choice> = {};
        data.preferences.avoid.forEach((id) => (saved[id] = 'avoid'));
        data.preferences.allergies.forEach((id) => (saved[id] = 'allergy'));
        setLoad({ state: 'ready', allergens: data.tags.map(({ id, label }) => ({ id, label })), saved });
        setChoices(saved);
      })
      .catch((error: unknown) => {
        // An ended login is handled by the login gate (the session is already cleared).
        if (!(error instanceof UnauthenticatedError)) setLoad({ state: 'failed' });
      });
  }, [environment]);

  useEffect(read, [read]);

  if (load.state === 'loading') return <p>Loading your allergen choices…</p>;
  if (load.state === 'failed') {
    return (
      <section role="alert" data-testid="preferences-failed">
        <p>We could not load your allergen choices. Nothing has changed.</p>
        <button
          type="button"
          onClick={() => {
            setLoad({ state: 'loading' });
            read();
          }}
        >
          Try again
        </button>
      </section>
    );
  }

  const { allergens, saved } = load;
  const dirty = !same(choices, saved);

  function save() {
    setOutcome(null);
    const ids = (wanted: Choice) => allergens.map((a) => a.id).filter((id) => (choices[id] ?? 'none') === wanted);
    commit({
      variables: { input: { allergies: ids('allergy'), avoid: ids('avoid') } },
      onCompleted: ({ savePreferences: result }) => {
        if (result.__typename === 'SavePreferencesSuccess') {
          const next: Record<string, Choice> = {};
          result.preferences.avoid.forEach((id) => (next[id] = 'avoid'));
          result.preferences.allergies.forEach((id) => (next[id] = 'allergy'));
          setLoad({ state: 'ready', allergens, saved: next });
          setChoices(next);
          setOutcome({ kind: 'saved' });
        } else if (result.__typename === 'SavePreferencesRejected') {
          setOutcome({ kind: 'rejected', message: result.message });
        } else {
          setOutcome({ kind: 'error' });
        }
      },
      onError: (error) => {
        if (error instanceof UnauthenticatedError) return;
        setOutcome({ kind: 'error', reference: error instanceof GraphQLRequestError ? error.reference : undefined });
      },
    });
  }

  return (
    <form
      aria-label="Your allergen choices"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p data-testid="preferences-note">
        Bakeries mark what their items contain. An item that is not marked is not guaranteed free of anything, so check
        with the bakery when it matters.
      </p>
      {allergens.map((allergen) => (
        <fieldset key={allergen.id} data-testid="allergen-group" data-allergen={allergen.id}>
          <legend>{allergen.label}</legend>
          {OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name={`allergen-${allergen.id}`}
                value={option.value}
                checked={(choices[allergen.id] ?? 'none') === option.value}
                onChange={() => {
                  setOutcome(null);
                  setChoices({ ...choices, [allergen.id]: option.value });
                }}
              />{' '}
              {option.label}
              {option.hint ? <small> ({option.hint})</small> : null}{' '}
            </label>
          ))}
        </fieldset>
      ))}
      <button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save my choices'}
      </button>
      {dirty && !saving && outcome === null ? <p data-testid="preferences-unsaved">You have unsaved changes.</p> : null}
      {outcome?.kind === 'saved' ? (
        <p role="status" data-testid="preferences-saved">
          Saved. Your choices are kept for next time.
        </p>
      ) : null}
      {outcome?.kind === 'rejected' ? (
        <p role="alert" data-testid="preferences-rejected">
          Not saved. {outcome.message} Your choices are still on the screen.
        </p>
      ) : null}
      {outcome?.kind === 'error' ? (
        <p role="alert" data-testid="preferences-error">
          Not saved. Something went wrong, and your choices are still on the screen. Please try again.
          {outcome.reference ? ` Reference: ${outcome.reference}` : ''}
        </p>
      ) : null}
    </form>
  );
}

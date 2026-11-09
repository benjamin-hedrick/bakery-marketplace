// Small wording helpers the sentence builders share. Not exported from the package: only the wording modules use them.

/** The text with its first letter in lower case, for a label that continues a sentence ("Tree nuts" becomes "tree nuts"). */
export const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** Names as a list in words: "a", "a and b", "a, b and c". */
export const joinNames = (names: readonly string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

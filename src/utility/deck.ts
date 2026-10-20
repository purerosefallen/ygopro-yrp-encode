import YGOProDeck from 'ygopro-deck-encode';

/** Normalize the dependency's CJS default export when loaded by native ESM. */
export function createDeck(
  init?: ConstructorParameters<typeof YGOProDeck>[0],
): YGOProDeck {
  const Deck =
    typeof YGOProDeck === 'function'
      ? YGOProDeck
      : (YGOProDeck as unknown as { default: typeof YGOProDeck }).default;
  return new Deck(init);
}

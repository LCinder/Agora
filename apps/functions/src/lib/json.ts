/**
 * Drops the keys a parsed body left as `undefined`.
 *
 * The project compiles with `exactOptionalPropertyTypes`, which draws a line
 * between "this key is absent" and "this key is present and undefined". That line
 * is worth having — `{ endAt: undefined }` and `{ endAt: null }` mean different
 * things to an event — but a schema parser produces the second shape for an
 * optional field that was not sent, and the stores only accept the first.
 *
 * So this is the boundary where one becomes the other: absent stays absent, and a
 * deliberate `null` survives, because `null` is a value here and not a gap.
 */
/**
 * The same shape with `undefined` taken out of every property.
 *
 * Homomorphic, so an optional key stays optional and a required one stays
 * required: `description?: string | undefined` becomes `description?: string`,
 * which is the shape the stores ask for.
 */
export type Defined<T> = { [Key in keyof T]: Exclude<T[Key], undefined> };

export function definedOnly<T extends object>(value: T): Defined<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Defined<T>;
}

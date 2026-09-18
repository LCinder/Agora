/**
 * The commercial name, in one place.
 *
 * The name is still provisional (decision 1 of the project document), so
 * everything user-facing reads it from `brand.json` instead of spelling it
 * out. Renaming the product is then editing one file, not grepping the
 * repository the week before a meeting with a town hall.
 *
 * `brand.json` and not a `.ts` constant because three things outside the
 * TypeScript build need the same values: the Expo config (`app.config.ts`),
 * the Android workflow, and whoever writes the Terraform variables. A JSON
 * file is the only format all of them read without a build step.
 *
 * What is deliberately NOT here: the names of the AWS resources. A DynamoDB
 * table cannot be renamed — Terraform would destroy it and create another —
 * so the physical names hang off `infra_name`, which stays `agora` forever and
 * is nobody's brand. See `docs/renombrar-la-app.md`.
 */

import brand from './brand.json';

export interface Brand {
  /** Display name, shown to residents and municipal staff. */
  readonly name: string;
  /** Lowercase identifier: the Expo slug and the store listing URL. */
  readonly slug: string;
  /** Deep link scheme, `<scheme>://event/<id>`. */
  readonly scheme: string;
  /** Android application id. Immutable once the app is published. */
  readonly androidPackage: string;
  /** iOS bundle identifier. Immutable once the app is published. */
  readonly iosBundleId: string;
  /** One line for the stores and the welcome screen. */
  readonly tagline: string;
}

export const BRAND: Brand = brand;

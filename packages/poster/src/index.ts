/**
 * Reading a poster and drawing one, with no framework attached.
 *
 * It lives in its own package because the same code answers through two doors:
 * the panel's route handlers when somebody runs it locally with `next dev`, and
 * the poster Lambda in the cloud. Before this, there were two copies of it — one
 * of them about to become the truth and the other about to rot.
 *
 * Nothing here reads the environment. Credentials are arguments, because the two
 * callers keep them in different places: a `.env.local` file in development,
 * Parameter Store in the cloud (D-041).
 */

export * from './draw-poster';
export * from './failure';
export * from './gemini';
export * from './read-poster';

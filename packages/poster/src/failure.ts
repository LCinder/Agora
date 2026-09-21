/**
 * Why a poster could not be read or drawn, and what to say about it.
 *
 * The taxonomy is shared rather than duplicated because the same failures reach a
 * municipal officer through two different doors: the panel's own route handler
 * when somebody is running it locally, and the poster Lambda in the cloud. The
 * message they read has to be the same one, and the status code too.
 *
 * The messages are in Spanish because a person reads them. Everything else in
 * this package — names, codes, comments — is in English, like the rest of the
 * codebase.
 */
export type PosterFailure =
  /** No credential configured for the provider. */
  | 'missing_key'
  | 'bad_key'
  | 'rate_limited'
  | 'unreachable'
  /** The model answered, but not with something usable. */
  | 'refused'
  | 'no_image'
  | 'unknown';

export type PosterResult<T> = { ok: true; value: T } | { ok: false; failure: PosterFailure };

/** What the API answers. A refusal is the caller's to fix, so it is a 4xx. */
export function statusFor(failure: PosterFailure): number {
  switch (failure) {
    case 'missing_key':
    case 'bad_key':
      return 503;
    case 'rate_limited':
      return 429;
    case 'refused':
    case 'no_image':
      return 422;
    default:
      return 502;
  }
}

export function codeFor(failure: PosterFailure): string {
  switch (failure) {
    case 'missing_key':
      return 'missing_api_key';
    case 'bad_key':
      return 'bad_api_key';
    default:
      return failure;
  }
}

/**
 * The sentence the officer reads.
 *
 * `what` is the thing that was being attempted, in the infinitive: "leer
 * carteles", "dibujar carteles". It reads as part of the sentence.
 */
export function messageFor(failure: PosterFailure, what: string): string {
  switch (failure) {
    case 'missing_key':
      return `Falta una clave de API para ${what}. Revisa la configuración del panel.`;
    case 'bad_key':
      return `La clave de API para ${what} no es válida.`;
    case 'rate_limited':
      return 'Se ha agotado la cuota gratuita por hoy. Vuelve a intentarlo mañana.';
    case 'unreachable':
      return 'No hemos podido conectar con el servicio de inteligencia artificial.';
    case 'refused':
      return 'No hemos podido entenderlo. Prueba a describirlo de otra manera o rellena los datos a mano.';
    case 'no_image':
      return 'El servicio ha respondido sin ningún cartel. Vuelve a intentarlo.';
    default:
      return `No hemos podido ${what}.`;
  }
}

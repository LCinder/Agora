/**
 * Lays the event details over a drawn background.
 *
 * The reason this exists rather than asking the image model for the finished
 * poster: a poster published by a town hall is an official announcement, and
 * an image model writing "sábado 12 de septiembre" into a picture gets it
 * subtly wrong often enough to matter. The date, the place and the town hall's
 * own colour are data the panel already holds, so it draws them itself and
 * they come out right every time.
 *
 * Runs in the browser: the panel has no server to render on (D-013).
 */

const WIDTH = 1536;
const HEIGHT = 2048; // 3:4, the shape asked of the image model.
const MARGIN = 96;

const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export type PosterText = {
  title: string;
  dateLabel: string;
  timeLabel: string;
  locationName: string;
  municipalityName: string;
  logoUrl: string | null;
  primaryColor: string;
};

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`No se ha podido cargar la imagen: ${source}`));
    image.src = source;
  });
}

/** Fills the canvas with the image, cropping the overflow rather than squashing it. */
function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement): void {
  const scale = Math.max(WIDTH / image.width, HEIGHT / image.height);
  const width = image.width * scale;
  const height = image.height * scale;

  context.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
}

function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;

    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) lines.push(line);
  return lines;
}

/**
 * Picks the largest size at which the title still fits in three lines. A long
 * title on a poster should get smaller, not spill off the edge.
 */
function fitTitle(
  context: CanvasRenderingContext2D,
  title: string,
  maxWidth: number,
): { lines: string[]; size: number } {
  for (let size = 130; size >= 56; size -= 6) {
    context.font = `700 ${size}px ${SANS}`;
    const lines = wrap(context, title, maxWidth);
    if (lines.length <= 3) return { lines, size };
  }

  context.font = `700 56px ${SANS}`;
  return { lines: wrap(context, title, maxWidth).slice(0, 3), size: 56 };
}

export async function composePoster(backgroundDataUrl: string, text: PosterText): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('El navegador no permite componer el cartel.');

  drawCover(context, await loadImage(backgroundDataUrl));

  // A scrim, so the text reads over whatever the model drew underneath.
  const scrim = context.createLinearGradient(0, HEIGHT * 0.42, 0, HEIGHT);
  scrim.addColorStop(0, 'rgba(0, 0, 0, 0)');
  scrim.addColorStop(0.45, 'rgba(0, 0, 0, 0.55)');
  scrim.addColorStop(1, 'rgba(0, 0, 0, 0.88)');
  context.fillStyle = scrim;
  context.fillRect(0, HEIGHT * 0.42, WIDTH, HEIGHT * 0.58);

  const maxWidth = WIDTH - MARGIN * 2;
  let bottom = HEIGHT - MARGIN;

  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';

  // Bottom up, so the block always ends flush with the margin however much
  // text there is.
  if (text.municipalityName) {
    context.font = `600 40px ${SANS}`;
    context.fillStyle = 'rgba(255, 255, 255, 0.75)';
    context.fillText(text.municipalityName.toUpperCase(), MARGIN, bottom);
    bottom -= 72;
  }

  if (text.locationName) {
    context.font = `500 48px ${SANS}`;
    context.fillStyle = 'rgba(255, 255, 255, 0.92)';
    context.fillText(text.locationName, MARGIN, bottom);
    bottom -= 76;
  }

  const when = [text.dateLabel, text.timeLabel].filter(Boolean).join(' · ');

  if (when) {
    context.font = `700 60px ${SANS}`;
    context.fillStyle = '#ffffff';
    context.fillText(when, MARGIN, bottom);
    bottom -= 40;

    // The town hall's colour, as a rule under the date.
    context.fillStyle = text.primaryColor;
    context.fillRect(MARGIN, bottom, 160, 10);
    bottom -= 56;
  }

  if (text.title) {
    const { lines, size } = fitTitle(context, text.title, maxWidth);
    context.fillStyle = '#ffffff';

    for (const line of [...lines].reverse()) {
      context.fillText(line, MARGIN, bottom);
      bottom -= size * 1.16;
    }
  }

  if (text.logoUrl) {
    try {
      const logo = await loadImage(text.logoUrl);
      const height = 140;
      const width = (logo.width / logo.height) * height;
      context.drawImage(logo, MARGIN, MARGIN, width, height);
    } catch {
      // A missing logo must not cost the officer the poster.
    }
  }

  return canvas.toDataURL('image/jpeg', 0.92);
}

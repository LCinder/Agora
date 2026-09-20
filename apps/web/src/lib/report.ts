/**
 * The annual report, as a PDF the town hall can file.
 *
 * This is the deliverable behind the whole "Me interesa" feature commercially: a
 * cultural officer has to write a memoria at the end of the year, and until now
 * they wrote it by hand from whatever they could remember. The product document
 * asks for CSV and PDF; the CSV is for a spreadsheet, and this is for pasting into
 * a document or attaching to an email.
 *
 * Two rules it inherits and must not break. Everything here is **aggregate**: a
 * count the API held back for being small enough to be a person arrives as null
 * and is printed as "menos de 5", never as a number and never as a zero. And when
 * the panel is running on the seed, the sheet says so on the first page — a PDF
 * with a town hall's name on it and invented numbers inside is exactly the kind of
 * thing that ends up filed as real.
 *
 * jsPDF is imported dynamically so a 400 kB library is not in the bundle of a
 * panel that mostly lists events. Its standard font covers Spanish accents, so
 * there is no font to embed either.
 */
export interface ReportFigure {
  label: string;
  value: string;
}

export interface ReportRow {
  title: string;
  when: string;
  category: string;
  /** Null when the count was held back for being too small to show. */
  interested: number | null;
}

export interface ReportInput {
  municipalityName: string;
  slug: string;
  /** The town's own colour, for the band at the top of the first page. */
  primaryColor: string;
  generatedAt: Date;
  /** What the numbers cover, written out: "de abril a septiembre de 2026". */
  period: string;
  figures: ReportFigure[];
  events: ReportRow[];
  categories: { name: string; interested: number | null }[];
  /** How many numbers were held back, so the sheet can say why. */
  suppressed: number;
  /** True when the numbers come from the seed and not from a municipality. */
  demo: boolean;
}

const PAGE = { width: 210, height: 297, margin: 16 };

/** Where the content stops and the footer begins. */
const BOTTOM = PAGE.height - 22;

const INK = { text: '#1A1A19', muted: '#6B7280', rule: '#D4D4D8' } as const;

function countLabel(interested: number | null): string {
  return interested === null ? 'menos de 5' : interested.toLocaleString('es-ES');
}

/** A hex colour as the three numbers jsPDF wants, with a safe fallback. */
function rgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const value = match?.[1] ?? '4F46E5';

  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

export async function downloadReport(input: ReportInput): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const right = PAGE.width - PAGE.margin;
  let y = PAGE.margin;

  function footer(): void {
    const page = doc.getNumberOfPages();

    doc.setDrawColor(INK.rule);
    doc.line(PAGE.margin, BOTTOM + 6, right, BOTTOM + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(INK.muted);
    doc.text(
      'Datos agregados. Ningún dato de este informe identifica a un vecino.',
      PAGE.margin,
      BOTTOM + 11,
    );
    doc.text(`Página ${page}`, right, BOTTOM + 11, { align: 'right' });
  }

  /** Makes sure `needed` millimetres are left, and starts a page when they are not. */
  function room(needed: number): void {
    if (y + needed <= BOTTOM) return;

    footer();
    doc.addPage();
    y = PAGE.margin;
  }

  function heading(text: string): void {
    room(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(INK.text);
    doc.text(text, PAGE.margin, y);
    y += 6;
  }

  // --- the first page's letterhead ------------------------------------------
  const [r, g, b] = rgb(input.primaryColor);

  doc.setFillColor(r, g, b);
  doc.rect(0, 0, PAGE.width, 5, 'F');

  y = 24;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(INK.text);
  doc.text('Informe de interés', PAGE.margin, y);

  y += 8;
  doc.setFontSize(13);
  doc.text(input.municipalityName, PAGE.margin, y);

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(INK.muted);
  doc.text(input.period, PAGE.margin, y);

  y += 4.5;
  doc.text(
    `Generado el ${input.generatedAt.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`,
    PAGE.margin,
    y,
  );

  if (input.demo) {
    y += 8;
    doc.setFillColor(254, 243, 199);
    doc.rect(PAGE.margin, y - 4.5, right - PAGE.margin, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(120, 53, 15);
    doc.text(
      'Datos de demostración: las cifras de este informe no son de un municipio real.',
      PAGE.margin + 2,
      y,
    );
    doc.setTextColor(INK.muted);
    doc.setFont('helvetica', 'normal');
  }

  y += 12;

  // --- the figures ---------------------------------------------------------
  const boxWidth = (right - PAGE.margin) / Math.max(input.figures.length, 1);

  room(22);
  doc.setDrawColor(INK.rule);

  input.figures.forEach((figure, index) => {
    const x = PAGE.margin + index * boxWidth;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(INK.muted);
    doc.text(figure.label.toUpperCase(), x, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(INK.text);
    doc.text(figure.value, x, y + 7);
  });

  y += 16;
  doc.line(PAGE.margin, y, right, y);
  y += 10;

  // --- events, most marked first -------------------------------------------
  heading('Eventos con más interesados');

  const columns = { title: PAGE.margin, when: 106, category: 140, interested: right };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(INK.muted);
  doc.text('EVENTO', columns.title, y);
  doc.text('FECHA', columns.when, y);
  doc.text('TIPO', columns.category, y);
  doc.text('INTERESADOS', columns.interested, y, { align: 'right' });
  y += 2;
  doc.setDrawColor(INK.rule);
  doc.line(PAGE.margin, y, right, y);
  y += 5;

  if (input.events.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(INK.muted);
    doc.text('No hay eventos publicados en este periodo.', PAGE.margin, y);
    y += 8;
  }

  for (const row of input.events) {
    const lines = doc.splitTextToSize(row.title, columns.when - columns.title - 4) as string[];

    room(lines.length * 4.5 + 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(INK.text);
    doc.text(lines, columns.title, y);
    doc.setTextColor(INK.muted);
    doc.text(row.when, columns.when, y);
    doc.text(row.category, columns.category, y);
    doc.setTextColor(INK.text);
    doc.text(countLabel(row.interested), columns.interested, y, { align: 'right' });

    y += lines.length * 4.5 + 2.5;
  }

  // --- interest by kind of activity ----------------------------------------
  if (input.categories.length > 0) {
    y += 6;
    heading('Interés por tipo de actividad');

    for (const category of input.categories) {
      room(6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(INK.text);
      doc.text(category.name, PAGE.margin, y);
      doc.text(countLabel(category.interested), columns.interested, y, { align: 'right' });
      y += 5.5;
    }
  }

  if (input.suppressed > 0) {
    y += 6;
    room(12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(INK.muted);

    const note =
      input.suppressed === 1
        ? 'Un dato aparece como "menos de 5" porque hay tan poca gente que podría identificarse.'
        : `${input.suppressed} datos aparecen como "menos de 5" porque hay tan poca gente que podría identificarse.`;

    doc.text(doc.splitTextToSize(note, right - PAGE.margin) as string[], PAGE.margin, y);
  }

  footer();

  doc.save(`informe-interes-${input.slug}-${input.generatedAt.getFullYear()}.pdf`);
}

'use client';

import { byStartDate, formatShortDate, readableOn, residentVisibleEvents } from '@agora/core';
import { useMemo, useState, type CSSProperties } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button, Card, Empty, PageHeader, StatTile } from '../../../components/ui';
import { DEMO_ACTIVE_DEVICES, demoInterestCount } from '../../../lib/demo';
import { usePanel } from '../../../lib/panel-store';
import { downloadReport, type ReportRow } from '../../../lib/report';

/**
 * The data panel.
 *
 * This is the screen that answers "what do I get for the money" in a meeting
 * with a councillor, and the one that feeds the annual report a cultural
 * officer has to write by hand every year.
 *
 * Two rules it must never break. Everything shown is aggregate: no screen in
 * this product ever identifies a neighbour. And a single series is drawn in a
 * single hue, with a table view beside it, so nothing depends on colour alone.
 */

const MONTHS = ['Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep'] as const;

/** `2026-09` written out for a document: "septiembre de 2026". */
function monthName(month: string): string {
  const [year, index] = month.split('-');
  const names = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];

  return `${names[Number(index) - 1] ?? month} de ${year ?? ''}`.trim();
}

/** `2026-09` as the axis wants it: "sep 26". */
function monthLabel(month: string): string {
  const [year, index] = month.split('-');
  const names = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sep',
    'oct',
    'nov',
    'dic',
  ];

  return `${names[Number(index) - 1] ?? month} ${year?.slice(2) ?? ''}`.trim();
}

/** A title that fits on an axis. */
function shorten(title: string): string {
  return title.length > 34 ? `${title.slice(0, 33)}…` : title;
}

export default function DataPage() {
  const { categories, demo, events, loading, municipality, role, stats } = usePanel();
  const municipal = role === 'municipal_editor' || role === 'municipal_admin';
  const [asTable, setAsTable] = useState(false);
  const [writing, setWriting] = useState(false);

  const published = useMemo(() => residentVisibleEvents(events), [events]);

  const byEvent = useMemo(() => {
    if (stats !== null) {
      // A count the API held back for being small enough to be a person comes as
      // null, and is left out rather than drawn as a zero: the chart would be
      // saying "nobody", which is not what null means (D-032).
      return stats.interests.topEvents
        .filter((entry) => entry.interested !== null)
        .map((entry) => ({ name: shorten(entry.title), interesados: entry.interested ?? 0 }))
        .sort((a, b) => b.interesados - a.interesados)
        .slice(0, 8);
    }

    return published
      .map((event) => ({
        name: shorten(event.title),
        interesados: demoInterestCount(event.id, event.isFeatured),
      }))
      .sort((a, b) => b.interesados - a.interesados)
      .slice(0, 8);
  }, [published, stats]);

  const byCategory = useMemo(() => {
    if (stats !== null) {
      return stats.interests.byCategory
        .filter((entry) => entry.interested !== null)
        .map((entry) => ({
          name:
            categories.find((category) => category.id === entry.categoryId)?.name ??
            entry.categoryId,
          interesados: entry.interested ?? 0,
        }))
        .sort((a, b) => b.interesados - a.interesados);
    }

    const totals = new Map<string, number>();

    for (const event of published) {
      const current = totals.get(event.categoryId) ?? 0;
      totals.set(event.categoryId, current + demoInterestCount(event.id, event.isFeatured));
    }

    // Labelled with the category's name, not its id: "semana-santa" is a
    // database key, and this chart ends up in a councillor's annual report.
    return [...totals.entries()]
      .map(([categoryId, interesados]) => ({
        name: categories.find((category) => category.id === categoryId)?.name ?? categoryId,
        interesados,
      }))
      .sort((a, b) => b.interesados - a.interesados);
  }, [categories, published, stats]);

  /**
   * New marks per month.
   *
   * From the API when there is one, where it is a counter written the moment a
   * resident marks something. In the demo it is invented from the seed, which is
   * why the card says so and why the PDF leaves it out (D-054).
   */
  const monthly = useMemo(() => {
    if (stats !== null) {
      return stats.interests.monthly.map((entry) => ({
        name: monthLabel(entry.month),
        interesados: entry.interested,
      }));
    }

    return MONTHS.map((month, index) => ({
      name: month,
      interesados: Math.round(
        (byEvent.reduce((sum, entry) => sum + entry.interesados, 0) / MONTHS.length) *
          (0.6 + index * 0.16),
      ),
    }));
  }, [byEvent, stats]);

  if (loading || !municipality) {
    return <p className="text-sm text-neutral-500">Cargando…</p>;
  }

  const totalInterest =
    stats?.interests.total ?? byEvent.reduce((sum, entry) => sum + entry.interesados, 0);
  const publishedCount = stats?.events.published ?? published.length;
  const averagePerEvent = publishedCount === 0 ? 0 : Math.round(totalInterest / publishedCount);

  /**
   * The PDF the memoria anual is made of.
   *
   * It carries the same numbers as this screen and the same rule about small
   * counts: what the API held back arrives as null and is printed as "menos de 5".
   * The rows come from the events themselves rather than from the chart, so the
   * report says what happened and when, which is what a report is for.
   */
  async function exportPdf() {
    if (!municipality) return;

    setWriting(true);

    try {
      // Dates in the municipality's own time zone, like everywhere else in this
      // product: a report that says the cabalgata was on the 5th in Madrid and the
      // 4th on the server is a report nobody trusts twice.
      const context = {
        now: new Date(),
        timeZone: municipality.timeZone,
        locale: 'es' as const,
      };

      const ordered = [...published].sort(byStartDate);
      const first = ordered[0];
      const last = ordered[ordered.length - 1];
      const period =
        first === undefined || last === undefined
          ? 'Sin eventos publicados'
          : `Del ${formatShortDate(first.startAt, context)} al ${formatShortDate(last.startAt, context)}`;

      // Keyed by title, because that is what both the chart and the API's top
      // events carry, and the API's list is the one that applies the threshold.
      const heldBack = new Map(
        (stats?.interests.topEvents ?? []).map((entry) => [entry.eventId, entry.interested]),
      );

      const rows: ReportRow[] = ordered
        .map((event) => ({
          title: event.title,
          when: formatShortDate(event.startAt, context),
          category: categories.find((entry) => entry.id === event.categoryId)?.name ?? '—',
          interested:
            stats === null
              ? demoInterestCount(event.id, event.isFeatured)
              : (heldBack.get(event.id) ?? null),
        }))
        .sort((left, right) => (right.interested ?? -1) - (left.interested ?? -1));

      await downloadReport({
        municipalityName: municipality.name,
        slug: municipality.slug,
        primaryColor: municipality.branding.primaryColor,
        generatedAt: new Date(),
        period,
        figures: [
          { label: 'Eventos publicados', value: String(publishedCount) },
          { label: 'Marcas de «Me interesa»', value: totalInterest.toLocaleString('es-ES') },
          { label: 'Media por evento', value: String(averagePerEvent) },
          ...(municipal
            ? [
                {
                  label: 'Dispositivos activos',
                  value: (stats?.devices.following ?? DEMO_ACTIVE_DEVICES).toLocaleString('es-ES'),
                },
              ]
            : []),
        ],
        events: rows,
        categories: byCategory.map((entry) => ({
          name: entry.name,
          interested: entry.interesados,
        })),
        // Only when it is real. The demo's line is invented from the seed, and a
        // made-up curve is the one thing a document with a town hall's name on it
        // must not carry — the screen may show it with a caption, paper cannot.
        monthly:
          stats === null
            ? []
            : stats.interests.monthly.map((entry) => ({
                label: monthName(entry.month),
                interested: entry.interested,
              })),
        suppressed: stats?.suppressed ?? 0,
        demo,
      });
    } finally {
      setWriting(false);
    }
  }

  function exportCsv() {
    const rows = [
      ['evento', 'interesados'],
      ...byEvent.map((entry) => [entry.name, String(entry.interesados)]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));

    const link = document.createElement('a');
    link.href = url;
    link.download = `interes-${municipality!.slug}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // The series takes the municipality's colour rather than a fixed blue — it
  // is their report. Lifted to 3:1 against each scheme's card, which is what
  // WCAG asks of a graphic object; the CSS picks the one that applies.
  const brand = municipality.branding.primaryColor;

  return (
    <div
      className="viz-root"
      style={
        {
          '--viz-series-brand-light': readableOn(brand, '#FFFFFF', 3),
          '--viz-series-brand-dark': readableOn(brand, '#1A1A19', 3),
        } as CSSProperties
      }
    >
      <PageHeader
        title="Datos"
        description="Interés de los vecinos por evento y por tipo de actividad. Siempre agregado: nunca se identifica a nadie."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setAsTable(!asTable)}>
              {asTable ? 'Ver gráficas' : 'Ver como tabla'}
            </Button>
            <Button variant="secondary" onClick={exportCsv}>
              Exportar CSV
            </Button>
            <Button
              brand={municipality.branding.primaryColor}
              disabled={writing}
              onClick={() => void exportPdf()}
            >
              {writing ? 'Generando…' : 'Informe en PDF'}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Eventos publicados" value={publishedCount} />
        <StatTile label="Marcas de «Me interesa»" value={totalInterest.toLocaleString('es-ES')} />
        <StatTile label="Media por evento" value={averagePerEvent} />
        {municipal ? (
          <StatTile
            label="Dispositivos activos"
            value={(stats?.devices.following ?? DEMO_ACTIVE_DEVICES).toLocaleString('es-ES')}
            hint="Vecinos con la app, sin registrarse"
          />
        ) : (
          <StatTile label="Eventos en revisión" value={stats?.events.awaitingReview ?? 0} />
        )}
      </div>

      {stats !== null && stats.suppressed > 0 ? (
        <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
          {stats.suppressed === 1
            ? 'Un dato no se muestra porque hay tan poca gente que podría identificarse.'
            : `${stats.suppressed} datos no se muestran porque hay tan poca gente que podría identificarse.`}
        </p>
      ) : null}

      {published.length === 0 ? (
        <div className="mt-6">
          <Empty>Todavía no hay eventos publicados de los que sacar datos.</Empty>
        </div>
      ) : asTable ? (
        <Table rows={byEvent} />
      ) : (
        <>
          <ChartCard title="Eventos con más interesados">
            <ResponsiveContainer width="100%" height={Math.max(240, byEvent.length * 38)}>
              <BarChart data={byEvent} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
                <XAxis type="number" stroke="var(--viz-axis)" fontSize={12} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={200}
                  stroke="var(--viz-axis)"
                  fontSize={12}
                />
                <Tooltip
                  cursor={{ fill: 'var(--viz-grid)' }}
                  contentStyle={{
                    background: 'var(--viz-surface)',
                    border: '1px solid var(--viz-grid)',
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
                <Bar
                  dataKey="interesados"
                  name="Interesados"
                  fill="var(--viz-series-1)"
                  radius={[0, 4, 4, 0]}
                  barSize={14}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <ChartCard title="Interés por tipo de actividad">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byCategory} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                  <XAxis dataKey="name" stroke="var(--viz-axis)" fontSize={12} />
                  <YAxis stroke="var(--viz-axis)" fontSize={12} />
                  <Tooltip
                    cursor={{ fill: 'var(--viz-grid)' }}
                    contentStyle={{
                      background: 'var(--viz-surface)',
                      border: '1px solid var(--viz-grid)',
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  />
                  <Bar
                    dataKey="interesados"
                    name="Interesados"
                    fill="var(--viz-series-1)"
                    radius={[4, 4, 0, 0]}
                    barSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Real when there is an API behind it. In the demo it is invented from
                the seed, and the caption underneath says so: a made-up line on a
                councillor's report is the one thing this screen must never do. */}
            <ChartCard title="Marcas nuevas por mes" hidden={monthly.length === 0}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={monthly} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                  <XAxis dataKey="name" stroke="var(--viz-axis)" fontSize={12} />
                  <YAxis stroke="var(--viz-axis)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--viz-surface)',
                      border: '1px solid var(--viz-grid)',
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="interesados"
                    name="Interesados"
                    stroke="var(--viz-series-1)"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-neutral-500">
        {stats === null
          ? 'Datos de ejemplo para la demostración. En el producto real proceden de las marcas anónimas de «Me interesa», y nunca se muestran segmentos con menos de cinco dispositivos.'
          : 'Las cifras salen de las marcas anónimas de «Me interesa». Nunca se muestran segmentos con menos de cinco dispositivos.'}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  children,
  hidden = false,
}: {
  title: string;
  children: React.ReactNode;
  hidden?: boolean;
}) {
  if (hidden) return null;

  return (
    <Card className="mt-6">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

function Table({ rows }: { rows: { name: string; interesados: number }[] }) {
  return (
    <Card className="mt-6 overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="mb-3 text-left text-lg font-semibold">
          Eventos con más interesados
        </caption>
        <thead>
          <tr className="border-b border-black/10 text-left dark:border-white/10">
            <th scope="col" className="py-2 pr-4 font-medium">
              Evento
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Interesados
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-black/5 dark:border-white/5">
              <td className="py-2 pr-4">{row.name}</td>
              <td className="py-2 text-right tabular-nums">{row.interesados}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

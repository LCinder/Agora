'use client';

import { readableOn, residentVisibleEvents } from '@agora/core';
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

export default function DataPage() {
  const { categories, events, loading, municipality } = usePanel();
  const [asTable, setAsTable] = useState(false);

  const published = useMemo(() => residentVisibleEvents(events), [events]);

  const byEvent = useMemo(
    () =>
      published
        .map((event) => ({
          name: event.title.length > 34 ? `${event.title.slice(0, 33)}…` : event.title,
          interesados: demoInterestCount(event.id, event.isFeatured),
        }))
        .sort((a, b) => b.interesados - a.interesados)
        .slice(0, 8),
    [published],
  );

  const byCategory = useMemo(() => {
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
  }, [categories, published]);

  const monthly = useMemo(
    () =>
      MONTHS.map((month, index) => ({
        name: month,
        interesados: Math.round(
          (byEvent.reduce((sum, entry) => sum + entry.interesados, 0) / MONTHS.length) *
            (0.6 + index * 0.16),
        ),
      })),
    [byEvent],
  );

  if (loading || !municipality) {
    return <p className="text-sm text-neutral-500">Cargando…</p>;
  }

  const totalInterest = byEvent.reduce((sum, entry) => sum + entry.interesados, 0);
  const averagePerEvent = published.length === 0 ? 0 : Math.round(totalInterest / published.length);

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
            <Button brand={municipality.branding.primaryColor} onClick={exportCsv}>
              Exportar CSV
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Eventos publicados" value={published.length} />
        <StatTile label="Marcas de «Me interesa»" value={totalInterest.toLocaleString('es-ES')} />
        <StatTile label="Media por evento" value={averagePerEvent} />
        <StatTile
          label="Dispositivos activos"
          value={DEMO_ACTIVE_DEVICES.toLocaleString('es-ES')}
          hint="Vecinos con la app instalada"
        />
      </div>

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

            <ChartCard title="Evolución mensual">
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
        Datos de ejemplo para la demostración. En el producto real proceden de las marcas anónimas
        de «Me interesa», y nunca se muestran segmentos con menos de cinco dispositivos.
      </p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
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

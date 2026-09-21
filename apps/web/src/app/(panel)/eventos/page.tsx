'use client';

import { byStartDate, formatWhen, type EventStatus } from '@agora/core';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Card, Empty, PageHeader, Select, StatusBadge } from '../../../components/ui';
import { usePanel } from '../../../lib/panel-store';

const STATUS_OPTIONS: { value: EventStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'published', label: 'Publicados' },
  { value: 'pending_review', label: 'Pendientes de revisión' },
  { value: 'cancelled', label: 'Cancelados' },
  { value: 'rejected', label: 'Rechazados' },
];

export default function EventsPage() {
  const { categories, events, loading, municipality, organizationId, organizations, role } =
    usePanel();
  const [status, setStatus] = useState<EventStatus | 'all'>('all');
  const [categoryId, setCategoryId] = useState('all');

  const ownOnly = role === 'org_editor';

  const filtered = useMemo(() => {
    return (
      events
        // An association's panel is its own events, as the product document puts
        // it (9.6). The API already keeps the rest of the town's drafts away from
        // them; this is so the list is theirs and not a mixed one.
        .filter((event) => !ownOnly || event.organizationId === organizationId)
        .filter((event) => status === 'all' || event.status === status)
        .filter((event) => categoryId === 'all' || event.categoryId === categoryId)
        .sort(byStartDate)
    );
  }, [categoryId, events, organizationId, ownOnly, status]);

  if (loading || !municipality) {
    return <p className="text-sm text-neutral-500">Cargando…</p>;
  }

  const context = { now: new Date(), timeZone: municipality.timeZone, locale: 'es' as const };

  return (
    <>
      <PageHeader
        title={ownOnly ? 'Mis eventos' : 'Eventos'}
        description={
          ownOnly
            ? 'Los eventos de tu asociación, con el estado en el que está cada uno.'
            : 'Todo lo que hay en la agenda, en cualquier estado.'
        }
        action={
          <Link
            href="/eventos/nuevo"
            className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-white"
            style={{ backgroundColor: municipality.branding.primaryColor }}
          >
            Nuevo evento
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <Select
          aria-label="Filtrar por estado"
          value={status}
          onChange={(event) => setStatus(event.target.value as EventStatus | 'all')}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Filtrar por categoría"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="all">Todas las categorías</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Empty>No hay eventos con estos filtros.</Empty>
      ) : (
        <div className="grid gap-3">
          {filtered.map((event) => {
            const organization = organizations.find((entry) => entry.id === event.organizationId);

            return (
              <Card key={event.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {formatWhen(event, context)} · {event.location.name}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {organization ? organization.name : 'Ayuntamiento'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={event.status} />
                    <Link
                      href={`/eventos/editar?id=${event.id}`}
                      className="text-sm font-semibold underline"
                    >
                      Editar
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

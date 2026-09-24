'use client';

import type { AuditEntry } from '@agora/data';
import { useCallback, useEffect, useState } from 'react';

import { Button, Card, Empty, PageHeader } from '../../../components/ui';
import { usePanel } from '../../../lib/panel-store';

/**
 * Who did what, and when.
 *
 * Nobody asked for this screen. What happens is that the secretary of a town
 * hall reads the data protection paperwork, gets to the part about being able to
 * show who published something, and asks. Until now the log was written on every
 * write and there was nothing that could read it — the promise existed and the
 * evidence did not.
 *
 * It also answers the question that actually comes up: three weeks later,
 * somebody wants to know who cancelled the verbena.
 *
 * Append only, by design. There is no method in the store that edits or deletes
 * a line, and therefore nothing here that offers to.
 */
const ACTIONS: Record<string, string> = {
  'event.create': 'creó un evento',
  'event.update': 'editó un evento',
  'event.change_requested': 'pidió un cambio en un evento publicado',
  'event.approve': 'aprobó un evento',
  'event.reject': 'rechazó un evento',
  'event.cancel': 'canceló un evento',
  'event.notice': 'envió un aviso de un evento',
  'change.approve': 'aprobó un cambio pendiente',
  'change.reject': 'rechazó un cambio pendiente',
  'organization.create': 'dio de alta una asociación',
  'organization.trust': 'marcó una asociación como de confianza',
  'organization.untrust': 'quitó la confianza a una asociación',
  'organization.status': 'cambió el estado de una asociación',
  'membership.invite': 'invitó a una persona al panel',
  'membership.revoke': 'quitó el acceso a una persona',
  'live.schedule': 'preparó un directo',
  'live.start': 'empezó un directo',
  'live.pause': 'pausó un directo',
  'live.end': 'terminó un directo',
};

/**
 * An unknown action is printed as it came rather than hidden.
 *
 * A line nobody can read is still evidence that something happened, and a table
 * that silently drops rows it does not recognise is worse than one with a raw
 * key in it — especially in the screen whose whole job is to be complete.
 */
function describe(action: string): string {
  return ACTIONS[action] ?? action;
}

function formatMoment(at: Date): string {
  return at.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ActivityPage() {
  const { auditLog, demo, loading, municipality, role } = usePanel();

  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setEntries(await auditLog());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [auditLog]);

  useEffect(() => {
    // The API is an external system as far as React is concerned: the state
    // update happens after the await, in a callback, not in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  if (loading || !municipality) {
    return <p className="text-sm text-neutral-600">Cargando…</p>;
  }

  if (role !== 'municipal_admin') {
    return (
      <>
        <PageHeader title="Actividad" />
        <Empty>El registro de actividad lo consulta el responsable municipal.</Empty>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Actividad"
        description="Qué se ha hecho en el panel de este municipio, de lo más reciente a lo más antiguo."
        action={
          <Button variant="secondary" onClick={() => void refresh()}>
            Actualizar
          </Button>
        }
      />

      {demo ? (
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          En esta demostración aparece lo que hagas tú ahora mismo: aprueba un evento en Revisión y
          vuelve aquí.
        </p>
      ) : null}

      {failed ? (
        <Empty>No se ha podido leer el registro. Vuelve a intentarlo en un momento.</Empty>
      ) : entries === null ? (
        <p className="text-sm text-neutral-600">Cargando…</p>
      ) : entries.length === 0 ? (
        <Empty>Todavía no hay nada registrado en este municipio.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Registro de actividad del panel de {municipality.name}
            </caption>
            <thead className="border-b border-black/10 text-left dark:border-white/10">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">
                  Cuándo
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Quién
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Qué
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-black/5 last:border-0 dark:border-white/5"
                >
                  <td className="whitespace-nowrap px-5 py-3 text-neutral-600 dark:text-neutral-400">
                    {formatMoment(entry.createdAt)}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{entry.actorId}</td>
                  <td className="px-5 py-3">
                    {describe(entry.action)}{' '}
                    <span className="font-mono text-xs text-neutral-600">{entry.entityId}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

'use client';

import { ORGANIZATION_TYPES, type OrganizationType } from '@agora/core';
import Link from 'next/link';
import { useState } from 'react';

import {
  Button,
  Card,
  Checkbox,
  Empty,
  Field,
  Input,
  PageHeader,
  Select,
} from '../../../components/ui';
import { usePanel } from '../../../lib/panel-store';

/**
 * The associations of the town.
 *
 * This screen is where the differentiating feature is actually run: the calendar
 * stays full because the brotherhoods, peñas, clubs and parent associations fill
 * it, and this is where the town hall lets them in and decides which ones it
 * trusts enough to publish without reading first.
 *
 * "De confianza" is the lever that keeps the review queue short, and it is the
 * one control here worth explaining rather than labelling.
 */
const TYPE_LABELS: Record<OrganizationType, string> = {
  brotherhood: 'Hermandad o cofradía',
  pena: 'Peña',
  sports_club: 'Club deportivo',
  parents_assoc: 'AMPA',
  cultural: 'Asociación cultural',
  seniors: 'Asociación de mayores',
  other: 'Otra',
};

/**
 * What the state means, said as what it is.
 *
 * `invited` used to read «Invitada», which told the technician an invitation had
 * gone out. None had: darla de alta writes a row and nothing else, and the
 * invitation is a separate step on Usuarios. The label now says which step is
 * missing.
 */
const STATUS_LABELS = {
  invited: 'Pendiente de invitar',
  active: 'Activa',
  disabled: 'De baja',
} as const;

export default function OrganizationsPage() {
  const {
    createOrganization,
    events,
    loading,
    municipality,
    organizations,
    role,
    setOrganizationStatus,
    setOrganizationTrusted,
  } = usePanel();

  const [name, setName] = useState('');
  const [type, setType] = useState<OrganizationType>('brotherhood');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading || !municipality) {
    return <p className="text-sm text-neutral-600">Cargando…</p>;
  }

  if (role === 'org_editor') {
    return (
      <>
        <PageHeader title="Asociaciones" />
        <Empty>Las asociaciones del municipio las gestiona el ayuntamiento.</Empty>
      </>
    );
  }

  async function add() {
    if (name.trim() === '') {
      setError('Falta el nombre de la asociación.');

      return;
    }

    setBusy(true);
    setError(null);

    try {
      await createOrganization({
        name: name.trim(),
        type,
        contactEmail: email.trim() === '' ? null : email.trim(),
      });

      setName('');
      setEmail('');
    } catch {
      setError('No hemos podido darla de alta. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Asociaciones"
        description="Quién puede subir eventos al calendario del municipio, y de quién te fías para que se publiquen sin revisar."
      />

      <Card className="mb-6">
<h2 className="font-display text-lg font-semibold">Dar de alta una asociación</h2>
        {/* The two steps, said out loud. Creating the association writes it into
            this list and sends nothing to anybody; what gives its responsable a
            way in is an invitation, which lives on Usuarios because that is where
            every account of this municipality is handled. A technician who is not
            told this dares de alta the peña, waits for an email that was never
            sent, and calls us. */}
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Esto la añade a la lista de abajo. Para que puedan entrar a subir sus eventos, invita
          después a su responsable en{' '}
          <Link href="/usuarios" className="font-semibold underline">
            Usuarios
          </Link>
          , con permisos de «Responsable de asociación». Ese es el paso que envía el correo.
        </p>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            void add();
          }}
        >
          <Field label="Nombre" required>
            <Input value={name} onChange={(changed) => setName(changed.target.value)} />
          </Field>

          <Field label="Tipo">
            <Select
              value={type}
              onChange={(changed) => setType(changed.target.value as OrganizationType)}
            >
              {ORGANIZATION_TYPES.map((option) => (
                <option key={option} value={option}>
                  {TYPE_LABELS[option]}
                </option>
              ))}
            </Select>
          </Field>

          {/* It is a contact, not a channel. Nothing is sent to this address:
              today the only email the product sends is the invitation on
              Usuarios, and the hint used to promise one on approval that does
              not exist. See D-075. */}
          <Field
            label="Correo de contacto"
            hint="Para tenerlo apuntado. Todavía no se envía ningún correo automático a esta dirección."
          >
            <Input
              type="email"
              value={email}
              onChange={(changed) => setEmail(changed.target.value)}
            />
          </Field>

          <div className="flex items-end">
            <Button type="submit" disabled={busy} brand={municipality.branding.primaryColor}>
              {busy ? 'Dando de alta…' : 'Dar de alta'}
            </Button>
          </div>
        </form>

        {error !== null ? (
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </Card>

      {organizations.length === 0 ? (
        <Empty>Todavía no hay asociaciones. Da de alta la primera aquí arriba.</Empty>
      ) : (
        <div className="grid gap-3">
          {organizations.map((organization) => {
            const theirs = events.filter((event) => event.organizationId === organization.id);
            const waiting = theirs.filter((event) => event.status === 'pending_review').length;

            return (
              <Card key={organization.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{organization.name}</p>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {TYPE_LABELS[organization.type]} · {STATUS_LABELS[organization.status]} ·{' '}
                      {theirs.length === 1 ? '1 evento' : `${theirs.length} eventos`}
                      {waiting > 0 ? ` · ${waiting} esperando revisión` : ''}
                    </p>
                    {organization.contactEmail === null ? null : (
                      <p className="text-sm text-neutral-600">{organization.contactEmail}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <Checkbox
                      label="De confianza"
                      hint="Sus eventos se publican sin pasar por revisión."
                      checked={organization.isTrusted}
                      onChange={(isTrusted) =>
                        void setOrganizationTrusted(organization.id, isTrusted)
                      }
                    />

                    <Button
                      variant={organization.status === 'disabled' ? 'secondary' : 'danger'}
                      onClick={() =>
                        void setOrganizationStatus(
                          organization.id,
                          organization.status === 'disabled' ? 'active' : 'disabled',
                        )
                      }
                    >
                      {organization.status === 'disabled' ? 'Reactivar' : 'Dar de baja'}
                    </Button>
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

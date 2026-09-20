'use client';

import type { Membership } from '@agora/data';
import { useCallback, useEffect, useState } from 'react';

import { Button, Card, Empty, Field, Input, PageHeader, Select } from '../../../components/ui';
import { type PanelRole, usePanel } from '../../../lib/panel-store';

/**
 * Who can get into this town hall's panel.
 *
 * Inviting somebody is two things at once and in this order: an account in
 * Cognito, which is what they sign in with, and a membership in the table, which
 * is what says what they may do (D-048). The API does both in one request; this
 * screen is the form in front of it.
 *
 * Taking access away is deleting the membership — the account may still exist, and
 * it no longer opens anything. That is the property the architecture was chosen
 * for: nothing to wait for, no token to expire.
 */
const ROLE_LABELS: Record<PanelRole, string> = {
  municipal_editor: 'Técnico municipal',
  municipal_admin: 'Responsable municipal',
  org_editor: 'Responsable de una asociación',
};

const ROLE_HINTS: Record<PanelRole, string> = {
  municipal_editor:
    'Crea y edita cualquier evento, aprueba los de las asociaciones y envía avisos.',
  municipal_admin: 'Todo lo anterior, más gestionar asociaciones y usuarios.',
  org_editor: 'Solo los eventos de su asociación.',
};

export default function StaffPage() {
  const { demo, invite, listStaff, loading, municipality, organizations, revokeStaff, role } =
    usePanel();

  const [staff, setStaff] = useState<Membership[] | null>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [invited, setInvited] = useState<PanelRole>('municipal_editor');
  const [organizationId, setOrganizationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStaff(await listStaff());
    } catch {
      // An editor rather than an administrator, or no coverage. Either way the
      // list stays as it was and the form below still says what it can.
    }
  }, [listStaff]);

  useEffect(() => {
    // The API is an external system as far as React is concerned: the state
    // update happens after the await, in a callback, not in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  if (loading || !municipality) {
    return <p className="text-sm text-neutral-500">Cargando…</p>;
  }

  if (role !== 'municipal_admin') {
    return (
      <>
        <PageHeader title="Usuarios" />
        <Empty>Quién tiene acceso al panel lo gestiona el responsable municipal.</Empty>
      </>
    );
  }

  async function send() {
    if (email.trim() === '') {
      setError('Falta el correo.');

      return;
    }

    if (invited === 'org_editor' && organizationId === '') {
      setError('El responsable de una asociación necesita su asociación.');

      return;
    }

    setBusy(true);
    setError(null);
    setDone(null);

    try {
      await invite({
        email: email.trim(),
        role: invited,
        ...(fullName.trim() === '' ? {} : { fullName: fullName.trim() }),
        ...(invited === 'org_editor' ? { organizationId } : {}),
      });

      setDone(email.trim());
      setEmail('');
      setFullName('');
      await refresh();
    } catch {
      setError('No hemos podido invitarle. Comprueba el correo e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Quién entra en el panel de este municipio, y con qué permisos."
      />

      <Card className="mb-6">
        <h2 className="text-lg font-semibold">Invitar a alguien</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {demo
            ? 'En esta demostración no se envía ningún correo: la invitación se queda en esta pantalla.'
            : 'Recibirá un correo con una contraseña temporal y elegirá la suya al entrar.'}
        </p>

        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            void send();
          }}
        >
          <Field label="Correo" required>
            <Input
              type="email"
              value={email}
              autoComplete="off"
              onChange={(changed) => setEmail(changed.target.value)}
            />
          </Field>

          <Field label="Nombre y apellidos">
            <Input value={fullName} onChange={(changed) => setFullName(changed.target.value)} />
          </Field>

          <Field label="Permisos" hint={ROLE_HINTS[invited]}>
            <Select
              value={invited}
              onChange={(changed) => setInvited(changed.target.value as PanelRole)}
            >
              {(['municipal_editor', 'municipal_admin', 'org_editor'] as const).map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Asociación" hidden={invited !== 'org_editor'} required>
            <Select
              value={organizationId}
              onChange={(changed) => setOrganizationId(changed.target.value)}
            >
              <option value="">Elige una asociación</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-end">
            <Button type="submit" disabled={busy} brand={municipality.branding.primaryColor}>
              {busy ? 'Invitando…' : 'Invitar'}
            </Button>
          </div>
        </form>

        {error !== null ? (
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}

        {done !== null ? (
          <p role="status" className="mt-3 text-sm">
            Invitación enviada a {done}.
          </p>
        ) : null}
      </Card>

      {staff === null || staff.length === 0 ? (
        <Empty>
          Todavía no hay nadie más con acceso. Invita a quien lleve la agenda del ayuntamiento.
        </Empty>
      ) : (
        <div className="grid gap-3">
          {staff.map((member) => {
            const organization = organizations.find((entry) => entry.id === member.organizationId);

            return (
              <Card key={member.authUserId}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">
                      {member.fullName === '' ? member.email : member.fullName}
                    </p>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {ROLE_LABELS[member.role]}
                      {organization === undefined ? '' : ` · ${organization.name}`}
                      {member.fullName === '' ? '' : ` · ${member.email}`}
                    </p>
                  </div>

                  <Button
                    variant="danger"
                    onClick={() => {
                      void revokeStaff(member.authUserId).then(refresh);
                    }}
                  >
                    Quitar acceso
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

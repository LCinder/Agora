'use client';

import { BRAND } from '@agora/core';
import { useState } from 'react';

import { completeNewPassword, signIn } from '../lib/auth';
import { usePanel } from '../lib/panel-store';
import { Button, Card, Field, Input } from './ui';

/**
 * The panel's front door.
 *
 * Municipal staff and associations only: a resident never has an account here
 * (D-029). Nobody can sign themselves up either — the town hall invites its own
 * people, and Cognito sends them a temporary password — so there is no "create an
 * account" link, and there should not be one.
 *
 * The second step exists because of that temporary password: the first time
 * somebody signs in, Cognito asks for a real one before it hands over a session.
 */
type Step =
  | { kind: 'credentials' }
  | { kind: 'new-password' }
  | { kind: 'working' }
  | { kind: 'error'; message: string; after: 'credentials' | 'new-password' };

export function SignIn() {
  const { refreshIdentity } = usePanel();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fresh, setFresh] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'credentials' });

  const asking =
    step.kind === 'new-password' || (step.kind === 'error' && step.after === 'new-password');

  async function submit() {
    const before = step;

    setStep({ kind: 'working' });

    const result = asking ? await completeNewPassword(fresh) : await signIn(email.trim(), password);

    if (result.status === 'signed-in') {
      await refreshIdentity();

      return;
    }

    if (result.status === 'new-password-required') {
      setStep({ kind: 'new-password' });

      return;
    }

    setStep({
      kind: 'error',
      message: result.message,
      after: before.kind === 'new-password' ? 'new-password' : 'credentials',
    });
  }

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Panel de {BRAND.name}</h1>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        {asking
          ? 'Elige tu contraseña para entrar a partir de ahora.'
          : 'Entra con el correo con el que te invitó el ayuntamiento.'}
      </p>

      <Card className="mt-6">
        <form
          className="grid gap-4"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            void submit();
          }}
        >
          {asking ? (
            <Field
              label="Contraseña nueva"
              hint="Al menos 12 caracteres, con mayúsculas y números."
              required
            >
              <Input
                type="password"
                value={fresh}
                autoComplete="new-password"
                onChange={(changed) => setFresh(changed.target.value)}
              />
            </Field>
          ) : (
            <>
              <Field label="Correo" required>
                <Input
                  type="email"
                  value={email}
                  autoComplete="username"
                  onChange={(changed) => setEmail(changed.target.value)}
                />
              </Field>
              <Field label="Contraseña" required>
                <Input
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  onChange={(changed) => setPassword(changed.target.value)}
                />
              </Field>
            </>
          )}

          {step.kind === 'error' ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {step.message}
            </p>
          ) : null}

          <Button type="submit" disabled={step.kind === 'working'}>
            {step.kind === 'working' ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </Card>

      <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
        ¿Sin acceso? Te invita el ayuntamiento desde su propio panel.
      </p>
    </main>
  );
}

'use client';

import { useState } from 'react';

import type { PosterReading } from '../lib/poster-contract';
import { PosterCreate, type PosterSubject } from './poster-create';
import { PosterImport } from './poster-import';
import { Card } from './ui';

/**
 * The poster, both ways round.
 *
 * Most events already have a poster and the work is getting it into the
 * calendar, which is what reading does. The rest have none, and an entry with
 * no image reads like an afterthought — which is what drawing is for.
 */

type Tab = 'read' | 'draw';

const TABS: { id: Tab; label: string }[] = [
  { id: 'read', label: 'Tengo el cartel' },
  { id: 'draw', label: 'No tengo cartel' },
];

export function PosterPanel({
  onRead,
  onPoster,
  subject,
}: {
  onRead: (reading: PosterReading) => void;
  /**
   * The image to put on the event, from whichever tab produced it.
   *
   * Both do: the photo of a real poster is the poster, and a drawn one is the
   * poster for an event that never had one. The form holds it until the event
   * is saved, because a new event has nothing to attach it to yet.
   */
  onPoster: (image: { mimeType: string; data: string }) => void;
  subject: PosterSubject;
}) {
  const [tab, setTab] = useState<Tab>('read');

  return (
    <Card className="h-fit">
      <h2 className="text-lg font-semibold">El cartel</h2>

      <div className="mt-3 flex gap-1 rounded-lg bg-black/5 p-1 dark:bg-white/10" role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-11 flex-1 rounded-md px-3 text-sm font-medium transition ${
              tab === id
                ? 'bg-white shadow-sm dark:bg-neutral-800'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'read' ? (
          <PosterImport onRead={onRead} onPoster={onPoster} />
        ) : (
          <PosterCreate subject={subject} onPoster={onPoster} />
        )}
      </div>
    </Card>
  );
}

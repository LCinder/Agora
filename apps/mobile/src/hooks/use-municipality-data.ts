import {
  residentVisibleEvents,
  type Event,
  type EventCategory,
  type Organization,
} from '@agora/core';
import { useCallback, useEffect, useState } from 'react';

import { dataSource } from '../lib/data';
import { useApp } from '../providers/app-provider';

/**
 * Loads everything a resident-facing screen needs for the active municipality.
 *
 * Only what residents may see is returned. Filtering here rather than in each
 * screen means a new screen cannot accidentally leak an event still waiting
 * for the town hall to approve it.
 */

export interface MunicipalityData {
  loading: boolean;
  events: Event[];
  categories: EventCategory[];
  organizations: Organization[];
  reload: () => void;
}

export function useMunicipalityData(): MunicipalityData {
  const { municipality } = useApp();

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!municipality) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    async function load(municipalityId: string) {
      const [allEvents, allCategories, allOrganizations] = await Promise.all([
        dataSource.listEvents(municipalityId),
        dataSource.listCategories(municipalityId),
        dataSource.listOrganizations(municipalityId),
      ]);

      if (!active) return;

      setEvents(residentVisibleEvents(allEvents));
      setCategories(allCategories);
      setOrganizations(allOrganizations);
      setLoading(false);
    }

    void load(municipality.id);

    return () => {
      active = false;
    };
  }, [municipality, nonce]);

  return { loading, events, categories, organizations, reload };
}

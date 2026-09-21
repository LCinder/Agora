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

/** One read of everything a municipality's screens need. */
async function readAll(municipalityId: string) {
  const [events, categories, organizations] = await Promise.all([
    dataSource.listEvents(municipalityId),
    dataSource.listCategories(municipalityId),
    dataSource.listOrganizations(municipalityId),
  ]);

  return { events: residentVisibleEvents(events), categories, organizations };
}

export interface MunicipalityData {
  /** The first load, the one that shows a skeleton instead of a calendar. */
  loading: boolean;
  /**
   * A reload the resident asked for by pulling the list down.
   *
   * Separate from `loading` on purpose: swapping the calendar they are looking
   * at for a skeleton is the one thing a pull-to-refresh must not do. The
   * events stay on screen and the spinner sits above them.
   */
  refreshing: boolean;
  events: Event[];
  categories: EventCategory[];
  organizations: Organization[];
  reload: () => void;
  /**
   * Re-reads everything and resolves when it has. Resolving matters: the
   * control that spins while it runs is waiting on this promise.
   */
  refresh: () => Promise<void>;
}

export function useMunicipalityData(): MunicipalityData {
  const { municipality } = useApp();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  const refresh = useCallback(async () => {
    if (!municipality) return;

    setRefreshing(true);

    try {
      const fresh = await readAll(municipality.id);

      setEvents(fresh.events);
      setCategories(fresh.categories);
      setOrganizations(fresh.organizations);
    } catch {
      // Pulled down in a street with no coverage. What is on screen is the last
      // good calendar, and saying nothing is better than replacing it with an
      // error the neighbour can do nothing about.
    } finally {
      setRefreshing(false);
    }
  }, [municipality]);

  useEffect(() => {
    if (!municipality) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    async function load(municipalityId: string) {
      const fresh = await readAll(municipalityId);

      if (!active) return;

      setEvents(fresh.events);
      setCategories(fresh.categories);
      setOrganizations(fresh.organizations);
      setLoading(false);
    }

    void load(municipality.id);

    return () => {
      active = false;
    };
  }, [municipality, nonce]);

  return { loading, refreshing, events, categories, organizations, reload, refresh };
}

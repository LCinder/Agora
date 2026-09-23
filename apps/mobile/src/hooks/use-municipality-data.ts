import {
  residentVisibleActivitiesFor,
  residentVisibleEvents,
  type Activity,
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
  const [events, activities, categories, organizations] = await Promise.all([
    dataSource.listEvents(municipalityId),
    dataSource.listActivities(municipalityId),
    dataSource.listCategories(municipalityId),
    dataSource.listOrganizations(municipalityId),
  ]);

  const visible = residentVisibleEvents(events);

  return {
    events: visible,
    // Narrowed against the events that survived, not against a status: an
    // activity is only ever as public as the event it belongs to, and filtering
    // the two lists independently would let the programme of a draft through.
    activities: residentVisibleActivitiesFor(activities, visible),
    categories,
    organizations,
  };
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
  /** Every programme in the town, for the events above. Empty most of the year. */
  activities: Activity[];
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
  const [activities, setActivities] = useState<Activity[]>([]);
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
      setActivities(fresh.activities);
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
      try {
        const fresh = await readAll(municipalityId);

        if (!active) return;

        setEvents(fresh.events);
        setActivities(fresh.activities);
        setCategories(fresh.categories);
        setOrganizations(fresh.organizations);
      } catch {
        // Same reasoning as `refresh` above, and the same silence: what is on
        // screen stays. The difference is that this is the first load, so what
        // stays is an empty calendar — which the screen shows as empty rather
        // than as a skeleton that never resolves (D-068).
      } finally {
        // In the `finally`, not after the awaits: a throw used to skip it, and a
        // calendar stuck on its skeleton was the result.
        if (active) setLoading(false);
      }
    }

    void load(municipality.id);

    return () => {
      active = false;
    };
  }, [municipality, nonce]);

  return {
    loading,
    refreshing,
    events,
    activities,
    categories,
    organizations,
    reload,
    refresh,
  };
}

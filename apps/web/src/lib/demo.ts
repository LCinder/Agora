/**
 * Demo configuration for the panel.
 *
 * The panel is shown for one municipality. In phase 2 it comes from the
 * session of the logged-in municipal officer; here it is a constant.
 */
export const DEMO_MUNICIPALITY_SLUG = 'la-zubia';
export const DEMO_MUNICIPALITY_ID = 'la-zubia';

/**
 * Stand-in for the device count of the municipality.
 *
 * The last invented number in the panel. The per-event tallies used to be
 * invented here too; they now ride on the events themselves, made up once by
 * the seed for the demo and counted for real everywhere else, so every screen
 * reads one field instead of choosing between a real number and a fake one.
 */
export const DEMO_ACTIVE_DEVICES = 2417;

/**
 * The evening reminder.
 *
 * Runs at 19:00 Europe/Madrid and is the only function allowed to read the index
 * that maps an event to the devices interested in it (D-032).
 *
 * Still a placeholder, and blocked on one decision rather than on code: there is
 * no push provider yet. `createReminderStore` already answers who to notify;
 * what is missing is what to hand the message to — Expo Push is the proposal
 * (docs/fase-2-aws.md, section 7).
 */
export const handler = async (): Promise<{ sent: number }> => {
  console.log(
    JSON.stringify({
      job: 'reminders',
      environment: process.env['ENVIRONMENT'],
      status: 'not_implemented',
      reason: 'no push provider chosen yet',
    }),
  );

  return { sent: 0 };
};

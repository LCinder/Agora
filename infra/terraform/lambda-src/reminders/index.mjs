/**
 * Runs each evening and sends the reminder for tomorrow`s events. The only
 * function allowed to read gsi3 and learn which devices to notify.
 *
 * Placeholder. Logs and does nothing, so the schedule can be verified before
 * anything is actually sent to a resident.
 */
export const handler = async () => {
  console.log(
    JSON.stringify({
      job: 'reminders',
      environment: process.env.ENVIRONMENT,
      status: 'not_implemented',
    }),
  );
  return { sent: 0 };
};

export type TelemetryEvent =
  | 'session_created'
  | 'session_updated'
  | 'session_deleted'
  | 'exercise_created'
  | 'exercise_updated'
  | 'exercise_deleted'
  | 'set_created'
  | 'set_updated'
  | 'set_deleted'
  | 'database_error';

export function track(event: TelemetryEvent, properties: Record<string, unknown> = {}): void {
  if (__DEV__) console.info('[telemetry]', event, properties);
}

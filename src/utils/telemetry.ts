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
  | 'bmi_measurement_created'
  | 'bmi_measurement_updated'
  | 'bmi_measurement_deleted'
  | 'database_error';

export function track(event: TelemetryEvent, properties: Record<string, unknown> = {}): void {
  if (__DEV__) console.info('[telemetry]', event, properties);
}

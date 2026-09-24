export const PORT = process.env.PORT || 3000;

/** Presence broadcast cadence — 20ms matches the original 50Hz update loop. */
export const PRESENCE_TICK_MS = 20;


export const AUDIENCES = ['all', 'user'] as const;

export type Audience = (typeof AUDIENCES)[number];

export const DEFAULT_AUDIENCE: Audience = 'all';

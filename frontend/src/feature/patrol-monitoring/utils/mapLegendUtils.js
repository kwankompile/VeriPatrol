/**
 * Map legend labels and hover tooltip copy for Patrol Monitoring route map.
 */

export const MAP_ROUTE_LEGEND_ITEMS = Object.freeze([
  {
    key: 'patrol_trail',
    label: 'Patrol trail',
    color: '#2563eb',
    style: 'solid',
    description: 'The full GPS path recorded during the patrol session, shown as a continuous blue line.'
  },
  {
    key: 'replay_traversed',
    label: 'Replay traversed',
    color: '#059669',
    style: 'solid',
    description: 'The portion of the route already played during route replay.'
  },
  {
    key: 'replay_remaining',
    label: 'Replay remaining',
    color: '#cbd5e1',
    style: 'dashed',
    description: 'The portion of the route not yet reached while replay is in progress.'
  },
  {
    key: 'guard_replay',
    label: 'Guard (replay)',
    color: '#0ea5e9',
    style: 'pin',
    description: 'The guard’s current position on the map during route replay.'
  },
  {
    key: 'gps_gap',
    label: 'GPS gap (>30s)',
    color: '#f97316',
    style: 'dashed',
    description: 'A segment where consecutive GPS points are more than 30 seconds apart, indicating possible signal loss.'
  },
  {
    key: 'breadcrumb',
    label: 'Breadcrumb',
    color: '#64748b',
    style: 'dot',
    description: 'An individual GPS breadcrumb point along the recorded patrol route.'
  },
  {
    key: 'start',
    label: 'Start',
    color: '#16a34a',
    style: 'pin',
    description: 'The first recorded GPS point marking where the patrol route began.'
  },
  {
    key: 'end',
    label: 'End',
    color: '#dc2626',
    style: 'pin',
    description: 'The last recorded GPS point marking where the patrol route ended.'
  }
]);

export const MAP_ANOMALY_LEGEND_ITEMS = Object.freeze([
  {
    key: 'speed_review',
    label: 'Speed review',
    color: '#dc2626',
    style: 'dashed',
    description: 'Movement speed between GPS points was unusually high or inconsistent with normal patrol movement.'
  },
  {
    key: 'gps_jump',
    label: 'GPS jump',
    color: '#9333ea',
    style: 'dashed',
    description: 'A sudden large distance between consecutive GPS fixes, suggesting a jump or unreliable location reading.'
  },
  {
    key: 'poor_accuracy',
    label: 'Poor GPS accuracy',
    color: '#ea580c',
    style: 'dashed',
    description: 'A route segment recorded with low GPS accuracy; nearby checkpoint evidence may be less reliable.'
  },
  {
    key: 'route_concern',
    label: 'Route concern',
    color: '#ca8a04',
    style: 'dashed',
    description: 'The guard path deviated meaningfully from expected movement between checkpoints or zone coverage.'
  },
  {
    key: 'timestamp_issue',
    label: 'Timestamp issue',
    color: '#1e293b',
    style: 'pin',
    description: 'GPS timestamps were out of order or inconsistent with the recorded movement pattern.'
  }
]);

export function getMapLegendItemTooltip(section, key) {
  const items = section === 'anomaly' ? MAP_ANOMALY_LEGEND_ITEMS : MAP_ROUTE_LEGEND_ITEMS;
  return items.find((item) => item.key === key)?.description ?? '';
}

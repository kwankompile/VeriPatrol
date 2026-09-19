import { getAuthUserRole, ROLES } from 'utils/auth';

import dashboard from './dashboard';
import guard from './guard';
import operator from './operator';
import admin from './admin';
import patrolHome from './patrolHome';

const OPERATOR_MONITORING_CHILD_IDS = new Set([
  'operator-patrol-monitoring',
  'operator-anpr-monitoring'
]);

/**
 * Operator sidebar for Security Operator — monitoring only (live/history routes are admin-only).
 */
const operatorMonitoringMenu = {
  ...operator,
  children: operator.children.filter((child) => OPERATOR_MONITORING_CHILD_IDS.has(child.id))
};

/**
 * @param {string | null} [role] — defaults to current user role from localStorage
 */
export function getMenuItemsForRole(role = getAuthUserRole()) {
  switch (role) {
    case ROLES.GUARD:
      return { items: [dashboard, guard] };
    case ROLES.SECURITY_OPERATOR:
      return { items: [dashboard, patrolHome, operatorMonitoringMenu] };
    case ROLES.ADMIN:
      return { items: [dashboard, patrolHome, operator, admin] };
    default:
      return { items: [] };
  }
}

export default getMenuItemsForRole;

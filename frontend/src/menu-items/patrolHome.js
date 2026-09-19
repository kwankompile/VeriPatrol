// assets
import { IconShieldChevron } from '@tabler/icons-react';

// constant
const icons = {
  IconShieldChevron
};

// ==============================|| MENU ITEMS - PATROL HOME (ALL ROLES) ||============================== //

const patrolHome = {
  id: 'patrol-home',
  title: 'Patrol',
  type: 'group',
  children: [
    {
      id: 'patrol-home-page',
      title: 'Patrol',
      type: 'item',
      url: '/patrol',
      icon: icons.IconShieldChevron
    }
  ]
};

export default patrolHome;

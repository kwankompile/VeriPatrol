// assets
import { IconAlertOctagon, IconCompass, IconHistory, IconShieldChevron } from '@tabler/icons-react';

// icons
const icons = {
  IconAlertOctagon,
  IconCompass,
  IconHistory,
  IconShieldChevron
};

// ==============================|| MENU ITEMS - GUARD ||============================== //

const guard = {
  id: 'guard',
  title: 'Guard',
  type: 'group',
  children: [
    {
      id: 'guard-patrol',
      title: 'Patrol',
      type: 'item',
      url: '/patrol',
      icon: icons.IconShieldChevron
    }
    // {
    //   id: 'guard-report',
    //   title: 'Report',
    //   type: 'item',
    //   url: '/guard/report',
    //   icon: icons.IconAlertOctagon,
    // },
    // {
    //   id: 'guard-checkpoints',
    //   title: 'Checkpoints',
    //   type: 'item',
    //   url: '/guard/checkpoints',
    //   icon: icons.IconCompass,
    // },
    // {
    //   id: 'guard-history',
    //   title: 'History',
    //   type: 'collapse',
    //   icon: icons.IconHistory,
    //   children: [
    //     {
    //       id: 'guard-patrol-history',
    //       title: 'Patrol History',
    //       type: 'item',
    //       url: '/guard/history/patrol'
    //     },
    //     {
    //       id: 'guard-report-history',
    //       title: 'Report History',
    //       type: 'item',
    //       url: '/guard/history/report',
    //     }
    //   ]
    // }
  ]
};

export default guard;

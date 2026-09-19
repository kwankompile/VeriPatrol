// assets
import { IconAlertOctagon, IconBarrierBlock, IconCar, IconChartDots3, IconMapPin2 } from '@tabler/icons-react';

// constant
const icons = {
  IconAlertOctagon,
  IconBarrierBlock,
  IconCar,
  IconChartDots3,
  IconMapPin2
};

// ==============================|| MENU ITEMS - OPERATOR ||============================== //

const operator = {
  id: 'operator',
  title: 'Operator',
  // caption: 'Operator Caption',
  // icon: icons.IconKey,
  type: 'group',
  children: [
    {
      id: 'operator-patrol-monitoring',
      title: 'Patrol Monitoring',
      type: 'item',
      url: '/admin/patrol-monitoring',
      icon: icons.IconMapPin2
    },
    {
      id: 'operator-anpr-monitoring',
      title: 'ANPR Monitoring',
      type: 'item',
      url: '/admin/anpr-monitoring',
      icon: icons.IconCar
    }
    // {
    //   id: 'operator-patrol',
    //   title: 'Patrol',
    //   type: 'collapse',
    //   icon: icons.IconMapPin2,
    //   children: [
    //     {
    //       id: 'operator-live-tracking',
    //       title: 'Live Tracking',
    //       type: 'item',
    //       url: '/operator/patrol/live-tracking'
    //     },
    //     {
    //       id: 'operator-patrol-history',
    //       title: 'History',
    //       type: 'item',
    //       url: '/operator/patrol/history'
    //     }
    // {
    //   id: 'operator-patrol-statistics',
    //   title: 'Statistics',
    //   type: 'item',
    //   url: '/operator/patrol/statistics'
    // }
    //   ]
    // }
    // {
    //   id: 'operator-report',
    //   title: 'Report',
    //   type: 'item',
    //   url: '/operator/report',
    //   icon: icons.IconAlertOctagoncd
    // },
    // {
    //   id: 'operator-ANPR',
    //   title: 'Gate ANPR',
    //   type: 'collapse',
    //   icon: icons.IconBarrierBlock,
    //   children: [
    //     {
    //       id: 'operator-live-anpr',
    //       title: 'Live ANPR',
    //       type: 'item',
    //       url: '/operator/gate/anprLive'
    //     },
    //     {
    //       id: 'operator-anpr-history',
    //       title: 'History',
    //       type: 'item',
    //       url: '/operator/gate/history'
    //     }
    //   ]
    // }
  ]
};

export default operator;

// assets
import { IconChartDots3, IconSettings, IconShieldCheck } from '@tabler/icons-react';

// constant
const icons = {
  IconChartDots3,
  IconSettings,
  IconShieldCheck
};

// ==============================|| MENU ITEMS - ADMIN ||============================== //

const admin = {
  id: 'admin',
  title: 'Admin',
  // caption: 'Admin Caption',
  // icon: icons.IconKey,
  type: 'group',
  children: [
    {
      id: 'admin-blockchain-monitoring',
      title: 'Blockchain Monitoring',
      type: 'item',
      url: '/admin/blockchain-monitoring',
      icon: icons.IconShieldCheck
    },
    {
      id: 'admin-management',
      title: 'Management',
      type: 'collapse',
      icon: icons.IconSettings,
      children: [
        {
          id: 'admin-user-management',
          title: 'User',
          type: 'item',
          url: '/admin/management-user'
        },
        {
          id: 'admin-zone-management',
          title: 'Zone',
          type: 'item',
          url: '/admin/management-zone'
        },
        // {
        //   id: 'admin-checkpoint-management',
        //   title: 'Checkpoint',
        //   type: 'item',
        //   url: '/admin/management-checkpoint'
        // },
        {
          id: 'admin-camera-management',
          title: 'Camera',
          type: 'item',
          url: '/admin/management-camera'
        },
        {
          id: 'admin-vehicle-management',
          title: 'Vehicle',
          type: 'item',
          url: '/admin/management-vehicle'
        },
        {
          id: 'admin-auth-monitoring',
          title: 'Auth Monitoring',
          type: 'item',
          url: '/admin/auth-monitoring'
        }
      ]
    }
  ]
};

export default admin;

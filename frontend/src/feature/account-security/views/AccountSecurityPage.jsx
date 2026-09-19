import { Navigate } from 'react-router-dom';

export default function AccountSecurityPage() {
  return <Navigate to="/account/profile?tab=security" replace />;
}

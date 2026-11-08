import React from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useMaintenance } from '../../context/MaintenanceContext.jsx';
import MaintenancePage from '../../pages/MaintenancePage.jsx';

export default function MaintenanceGuard({ children }) {
  const { user } = useAuth();
  const { maintenance, isMaintenanceActive, refreshMaintenance } = useMaintenance();

  // Administrators always bypass maintenance mode to maintain and operate the platform
  if (user?.role === 'ADMIN') {
    return children;
  }

  // If maintenance is active and user is not an admin, display the branded maintenance page
  if (isMaintenanceActive) {
    return <MaintenancePage maintenanceData={maintenance} onRefresh={refreshMaintenance} />;
  }

  return children;
}

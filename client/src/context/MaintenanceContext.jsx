import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';

const MaintenanceContext = createContext({
  maintenance: { enabled: false },
  isMaintenanceActive: false,
  loading: true,
  refreshMaintenance: async () => {}
});

export function MaintenanceProvider({ children }) {
  const [maintenance, setMaintenance] = useState({ enabled: false });
  const [loading, setLoading] = useState(true);

  const fetchMaintenance = useCallback(async () => {
    try {
      const res = await api.get('/system/maintenance');
      if (res?.success && res.maintenance) {
        setMaintenance(res.maintenance);
        return res.maintenance;
      }
    } catch (err) {
      // Ignore network errors on check
    } finally {
      setLoading(false);
    }
    return null;
  }, []);

  useEffect(() => {
    fetchMaintenance();

    // Listen to real-time events triggered when 503 is returned or admin toggles mode
    const onMaintenanceDetected = (e) => {
      if (e?.detail) {
        setMaintenance(e.detail);
      }
    };
    const onMaintenanceChanged = (e) => {
      if (e?.detail) {
        setMaintenance(e.detail);
      }
    };

    window.addEventListener('pasconx:maintenance-detected', onMaintenanceDetected);
    window.addEventListener('pasconx:maintenance-changed', onMaintenanceChanged);

    // Cross-tab real-time sync via BroadcastChannel
    let bc = null;
    try {
      bc = new BroadcastChannel('pasconx_maintenance_channel');
      bc.onmessage = (event) => {
        if (event?.data?.type === 'MAINTENANCE_UPDATE' && event.data.maintenance) {
          setMaintenance(event.data.maintenance);
        }
      };
    } catch (e) {
      // BroadcastChannel fallback
    }

    // Dynamic polling: fast 5s polling while maintenance is active, 30s when inactive
    const pollInterval = maintenance?.enabled ? 5000 : 30000;
    const timer = setInterval(fetchMaintenance, pollInterval);

    return () => {
      window.removeEventListener('pasconx:maintenance-detected', onMaintenanceDetected);
      window.removeEventListener('pasconx:maintenance-changed', onMaintenanceChanged);
      if (bc) bc.close();
      clearInterval(timer);
    };
  }, [fetchMaintenance, maintenance?.enabled]);

  const value = {
    maintenance,
    isMaintenanceActive: Boolean(maintenance?.enabled),
    loading,
    refreshMaintenance: fetchMaintenance
  };

  return (
    <MaintenanceContext.Provider value={value}>
      {children}
    </MaintenanceContext.Provider>
  );
}

export function useMaintenance() {
  const context = useContext(MaintenanceContext);
  if (!context) {
    throw new Error('useMaintenance must be used within a MaintenanceProvider');
  }
  return context;
}

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
      }
    } catch (err) {
      // Ignore network errors on check
    } finally {
      setLoading(false);
    }
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

    // Periodic poll every 60s
    const timer = setInterval(fetchMaintenance, 60 * 1000);

    return () => {
      window.removeEventListener('pasconx:maintenance-detected', onMaintenanceDetected);
      window.removeEventListener('pasconx:maintenance-changed', onMaintenanceChanged);
      clearInterval(timer);
    };
  }, [fetchMaintenance]);

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

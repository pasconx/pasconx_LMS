import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const CourseContext = createContext(null);

// Cache TTL: 60 seconds fresh data
const CACHE_TTL_MS = 60 * 1000;

export function CourseProvider({ children }) {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  
  const cachedUserIdRef = useRef(null);
  const lastFetchedRef = useRef(0);
  const inFlightPromiseRef = useRef(null);

  const fetchCourses = useCallback(async (force = false) => {
    if (!user || user.role !== 'STUDENT') {
      setCourses([]);
      cachedUserIdRef.current = null;
      lastFetchedRef.current = 0;
      return [];
    }

    const currentUserId = user.id;
    const isDifferentUser = cachedUserIdRef.current !== currentUserId;
    const now = Date.now();
    const isFresh = !isDifferentUser && (now - lastFetchedRef.current) < CACHE_TTL_MS;

    // 1. If cache is fresh, belongs to the exact same user, and not forced: return cached courses instantly (0ms)
    if (!force && isFresh && courses.length > 0) {
      return courses;
    }

    // 2. If user changed, immediately purge existing courses from state
    if (isDifferentUser) {
      setCourses([]);
      cachedUserIdRef.current = currentUserId;
      lastFetchedRef.current = 0;
    }

    // 3. If a request is already in-flight for this user, reuse the same promise
    if (inFlightPromiseRef.current) {
      return inFlightPromiseRef.current;
    }

    // 4. Show loading state or silent background refresh
    if (courses.length > 0 && !isDifferentUser) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    const promise = (async () => {
      try {
        const res = await api.get('/student/courses');
        // Verify user did not switch while request was in-flight
        if (cachedUserIdRef.current === currentUserId && res.success && Array.isArray(res.courses)) {
          setCourses(res.courses);
          lastFetchedRef.current = Date.now();
          return res.courses;
        } else if (res.success && Array.isArray(res.courses)) {
          return res.courses;
        } else {
          const errMsg = res.error || 'Failed to load courses.';
          setError(errMsg);
          return [];
        }
      } catch (err) {
        const errMsg = err.message || 'Failed to load your enrolled courses.';
        setError(errMsg);
        return [];
      } finally {
        setLoading(false);
        setIsRefreshing(false);
        inFlightPromiseRef.current = null;
      }
    })();

    inFlightPromiseRef.current = promise;
    return promise;
  }, [user, courses]);

  // Invalidate cache (e.g. after progress update or enrollment change)
  const invalidateCourses = useCallback(() => {
    lastFetchedRef.current = 0;
  }, []);

  // Fetch when student logs in / switch users
  useEffect(() => {
    if (user && user.role === 'STUDENT') {
      fetchCourses(cachedUserIdRef.current !== user.id);
    } else {
      setCourses([]);
      cachedUserIdRef.current = null;
      lastFetchedRef.current = 0;
    }
  }, [user?.id, user?.role, fetchCourses]);

  return (
    <CourseContext.Provider
      value={{
        courses,
        loading,
        isRefreshing,
        error,
        fetchCourses,
        invalidateCourses
      }}
    >
      {children}
    </CourseContext.Provider>
  );
}

export function useCourses() {
  const context = useContext(CourseContext);
  if (!context) {
    throw new Error('useCourses must be used within a CourseProvider');
  }
  return context;
}

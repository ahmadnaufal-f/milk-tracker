import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { auth, db } from '@/firebase';
import { User, getIdTokenResult, onIdTokenChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { refreshGuestActivity } from '@/services/storage';

interface AuthContextType {
  user: User | null;
  isGuest: boolean;
  hasGuestMigration: boolean;
  /** Compatibility alias; reflects app guest status for migrated custom-token sessions too. */
  isAnonymous: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasGuestMigrationClaim, setHasGuestMigrationClaim] = useState(false);
  const [profileIsAnonymous, setProfileIsAnonymous] = useState<boolean | null>(null);
  const activityRefreshedUid = useRef<string | null>(null);
  const observedUid = useRef<string | null>(null);
  const [authRevision, setAuthRevision] = useState(0);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, (firebaseUser) => {
      const nextUid = firebaseUser?.uid ?? null;
      if (nextUid !== observedUid.current) {
        observedUid.current = nextUid;
        setHasGuestMigrationClaim(false);
        setProfileIsAnonymous(null);
        setLoading(Boolean(firebaseUser));
      }
      if (!firebaseUser) setLoading(false);
      setUser(firebaseUser);
      setAuthRevision((revision) => revision + 1);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setHasGuestMigrationClaim(false);
      setProfileIsAnonymous(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), { includeMetadataChanges: true }, (snapshot) => {
      if (cancelled || snapshot.metadata.fromCache) return;
      const marker = snapshot.exists() ? snapshot.get('isAnonymous') : undefined;
      setProfileIsAnonymous(typeof marker === 'boolean' ? marker : null);
    }, () => {
      // Profile metadata can be temporarily unavailable; the Firebase
      // isAnonymous flag or verified migration claim still determines status.
      if (!cancelled) setProfileIsAnonymous(null);
    });

    void getIdTokenResult(user).then((token) => {
      if (cancelled) return;
      setHasGuestMigrationClaim(token.claims.guestMigration === true);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribeProfile();
    };
  }, [user, authRevision]);

  const hasGoogleProvider = Boolean(user?.providerData?.some((provider) => provider.providerId === 'google.com'));
  const isGuest = Boolean(user?.isAnonymous || (hasGuestMigrationClaim && profileIsAnonymous !== false && !hasGoogleProvider));

  useEffect(() => {
    if (!user) {
      activityRefreshedUid.current = null;
      return;
    }
    if (loading || !isGuest || activityRefreshedUid.current === user.uid) return;
    activityRefreshedUid.current = user.uid;
    void refreshGuestActivity(user.uid);
  }, [user, isGuest, loading]);

  return (
    <AuthContext.Provider value={{
      user,
      isGuest,
      hasGuestMigration: hasGuestMigrationClaim,
      isAnonymous: isGuest,
      loading,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

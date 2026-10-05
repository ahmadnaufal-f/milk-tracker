import { getIdTokenResult, GoogleAuthProvider, linkWithPopup, reauthenticateWithPopup, User } from 'firebase/auth';
import { auth } from '@/firebase';
import { markGuestAccountLinked, refreshGuestActivity } from '@/services/storage';

export type LinkGuestAccountResult =
  | { status: 'linked'; user: User }
  | { status: 'reauth-required' }
  | { status: 'collision' }
  | { status: 'cancelled' }
  | { status: 'error'; error: unknown };

export class GuestAccountLinkEligibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuestAccountLinkEligibilityError';
  }
}

const getErrorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
};

/** Links Google to the current guest UID and never signs into a colliding account. */
export async function linkGuestAccount(user: User): Promise<LinkGuestAccountResult> {
  try {
    if (auth.currentUser?.uid !== user.uid) {
      return { status: 'error', error: new GuestAccountLinkEligibilityError('This guest session is no longer active.') };
    }
    const eligibility = await refreshGuestActivity(user.uid);
    if (eligibility.status !== 'updated') {
      const message = eligibility.status === 'cleanup-in-progress'
        ? 'This guest session is being safely cleaned up and cannot be linked right now.'
        : eligibility.status === 'not-guest'
          ? 'This guest session is no longer active.'
          : 'Connect to the internet and try again before linking this account.';
      return { status: 'error', error: new GuestAccountLinkEligibilityError(message) };
    }
    const result = await linkWithPopup(user, new GoogleAuthProvider());
    if (result.user.uid !== user.uid) {
      return { status: 'error', error: new GuestAccountLinkEligibilityError('The linked account did not match this guest session.') };
    }

    let linkedUser = result.user;
    let reauthenticationFailed = false;
    try {
      const token = await getIdTokenResult(result.user, true);
      const firebaseClaims = token.claims.firebase;
      const signInProvider = typeof firebaseClaims === 'object' && firebaseClaims !== null
        ? (firebaseClaims as Record<string, unknown>).sign_in_provider
        : undefined;
      if (token.claims.guestMigration === true && signInProvider !== 'google.com') {
        // Linking a provider can leave this tab holding its old custom-token
        // session. Reauthenticate the same UID before finalizing the profile.
        const refreshed = await reauthenticateWithPopup(result.user, new GoogleAuthProvider());
        if (refreshed.user.uid !== user.uid) {
          reauthenticationFailed = true;
        } else {
          linkedUser = refreshed.user;
          const refreshedToken = await getIdTokenResult(refreshed.user, true);
          const refreshedFirebaseClaims = refreshedToken.claims.firebase;
          const refreshedProvider = typeof refreshedFirebaseClaims === 'object' && refreshedFirebaseClaims !== null
            ? (refreshedFirebaseClaims as Record<string, unknown>).sign_in_provider
            : undefined;
          if (refreshedToken.claims.guestMigration === true && refreshedProvider !== 'google.com') {
            reauthenticationFailed = true;
          }
        }
      }
    } catch {
      reauthenticationFailed = true;
    }

    // The server-side profile update revokes guest migration access. Perform it
    // only after verifying a normal Google token so the custom-token session
    // can still read its own profile during reauthentication.
    if (reauthenticationFailed) {
      try {
        await markGuestAccountLinked(user.uid);
      } catch {
        // The required recovery state is the same whether finalization succeeded
        // or the stale session still needs to sign in again.
      }
      return { status: 'reauth-required' };
    }
    if (!(await markGuestAccountLinked(user.uid))) return { status: 'reauth-required' };
    return { status: 'linked', user: linkedUser };
  } catch (error) {
    const code = getErrorCode(error);
    if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
      return { status: 'collision' };
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return { status: 'cancelled' };
    }
    return { status: 'error', error };
  }
}

/** Anonymous mode: replaces the logged-in user's visible identity in
    the top bar and the thread quick-reply column. Nothing is posted
    differently — this is display-only camouflage. */

import { loadSettings } from './settings.js';
import { api } from '../api.js';

// Generic placeholder identity: no user_id, avatar is the site favicon.
const VOZ_ICON = '/assets/img/voz-icon-192.png';
const HIDDEN_USER = {
  user_id: 0,
  username: 'User',
  avatar_urls: { s: VOZ_ICON, m: VOZ_ICON, l: VOZ_ICON, o: VOZ_ICON },
};

// The user shown instead of the real account, or null in hide mode.
export function displayUser(me) {
  if (!me) return me;
  const { anonMode } = loadSettings();
  if (anonMode === 'hide') return HIDDEN_USER;
  if (anonMode === 'mimic') {
    const { anonMimic } = loadSettings();
    if (anonMimic && anonMimic.user_id) return anonMimic;
  }
  return me;
}

// Hide mode can additionally drop the quick-reply box entirely —
// writing a reply would immediately re-expose the real account anyway.
export function hideQuickReply() {
  const { anonMode, anonHideReply } = loadSettings();
  return anonMode === 'hide' && anonHideReply === true;
}

// Accepts a profile URL or plain username, resolves to a user object.
// Profile URLs look like /members/username.123/ or /members/123/.
export function parseProfileInput(raw) {
  const input = String(raw ?? '').trim();
  if (!input) return null;
  const urlMatch = input.match(/members\/(?:[^/.\s]+\.)?(\d+)\/?(?:\?|$)/);
  if (urlMatch) return { userId: Number(urlMatch[1]) };
  const idMatch = input.match(/^(\d+)$/);
  if (idMatch) return { userId: Number(idMatch[1]) };
  // Plain username — strip any accidental @ or trailing slash.
  const name = input.replace(/^@/, '').replace(/\/+$/, '');
  if (/^[^\s/.]{2,40}$/.test(name)) return { username: name };
  return null;
}

// Resolves parsed input into a storable user record via the XF API.
export async function resolveMimicUser(parsed) {
  if (!parsed) throw new Error('invalid-input');
  let userId = parsed.userId;
  if (!userId) {
    const found = await api.findUser(parsed.username);
    // XF answers { exact: {...} } on a name match, recommendations otherwise.
    if (found?.exact?.user_id) userId = found.exact.user_id;
    else if (found?.recommendations?.[0]?.user_id) userId = found.recommendations[0].user_id;
    else throw new Error('user-not-found');
  }
  const full = await api.user(userId);
  const user = full?.user || full;
  if (!user?.user_id) throw new Error('user-not-found');
  return {
    user_id: user.user_id,
    username: user.username,
    avatar_urls: user.avatar_urls || {},
  };
}

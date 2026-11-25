/** Header + nav chrome. */

import { accountEl, breadcrumbsEl, navEl, state } from '../core/dom.js';
import { esc } from '../core/utils.js';
import { userPath } from '../core/paths.js';
import { navigate } from '../core/nav.js';
import { avatarMarkup } from '../lib/avatar.js';
import { displayUser } from '../lib/anon.js';
import { loadSettings, getMergeShortcuts } from '../lib/settings.js';
import { auth } from '../api.js';
import { toast } from './feedback.js';
import { refreshUnreadCounts } from './unreadCounts.js';
import { ICON_SEARCH, ICON_MAIL, ICON_BELL, ICON_POWER, ICON_EDIT } from '../core/icons.js';

const menuButton = (kind, label, icon, content) => `<div class="header-menu-wrap"><button class="header-icon" type="button" data-header-menu="${kind}" aria-label="${label}" title="${label}" aria-expanded="false" aria-controls="header-menu-${kind}">${icon}</button><section class="header-menu" id="header-menu-${kind}" aria-label="${label}" hidden><h2>${label}</h2>${content}</section></div>`;

function shortcutLi(shortcut) {
  const li = document.createElement('li');
  li.dataset.shortcutId = shortcut.id;
  const link = document.createElement('a');
  link.href = shortcut.url;
  link.textContent = shortcut.name;
  link.title = `${shortcut.name} — ${shortcut.url}`;
  li.append(link);
  return li;
}

// Shortcuts render next to "Bài mới" in saved order.
export function renderNavShortcuts() {
  if (!navEl) return;
  for (const item of navEl.querySelectorAll('[data-shortcut-id]')) item.remove();
  const { navShortcuts } = loadSettings();
  if (getMergeShortcuts()) return; // header bar owns them in merged mode
  const fragment = document.createDocumentFragment();
  for (const shortcut of navShortcuts) fragment.append(shortcutLi(shortcut));
  navEl.append(fragment);
}

// Merged mode: shortcuts share the header line with the account icons.
// No overflow fitting — the strip scrolls horizontally when too long:
// mobile touch-swipes natively; desktop drags with the mouse (below) or
// shift+wheel / horizontal trackpad. Plain vertical wheel is deliberately
// NOT hijacked — it must keep scrolling the page even over the strip.
function renderMergedShortcuts() {
  const ul = document.querySelector('.p-header-shortcuts ul');
  if (!ul) return;
  ul.querySelectorAll('[data-shortcut-id]').forEach((el) => el.remove());
  const { navShortcuts } = loadSettings();
  const fragment = document.createDocumentFragment();
  for (const shortcut of navShortcuts) fragment.append(shortcutLi(shortcut));
  ul.append(fragment);
}

let mergedScrollWired = false;

// Mouse drag-to-scroll. Vertical wheel events are left alone so page scroll
// (and chrome auto-hide) behaves normally everywhere.
function wireMergedScroll() {
  if (mergedScrollWired) return;
  mergedScrollWired = true;
  const ul = document.querySelector('.p-header-shortcuts ul');
  if (!ul) return;
  let dragging = false;
  let startX = 0;
  let startScroll = 0;
  let moved = false;
  let lastDragEnd = 0;
  // Links are natively draggable — the ghost drag would fight mouse scrolling.
  ul.addEventListener('dragstart', (event) => event.preventDefault());
  // Plain mouse events rather than pointer capture: capture retargets the
  // click to the strip, so shortcut links become unclickable. Window-level
  // move/up still track drags that leave the strip.
  ul.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    moved = false;
    startX = event.clientX;
    startScroll = ul.scrollLeft;
  });
  window.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    const dx = event.clientX - startX;
    if (!moved && Math.abs(dx) < 5) return; // dead zone: a click is not a drag
    moved = true;
    ul.classList.add('is-dragging');
    ul.scrollLeft = startScroll - dx;
  }, { passive: true });
  // While a drag is active the page must not scroll — scrolling slides the
  // header away mid-drag and auto-hide swallows it. Wheel input during the
  // drag goes into the strip horizontally instead.
  window.addEventListener('wheel', (event) => {
    if (!dragging) return;
    event.preventDefault();
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    ul.scrollLeft += delta;
  }, { passive: false, capture: true });
  // Hovering the strip: wheel moves it horizontally, always. Even at either
  // end the event is swallowed — the user explicitly wants the page to stay
  // put whenever the cursor is over the strip.
  ul.addEventListener('wheel', (event) => {
    if (dragging) return; // drag handler above already owns the wheel
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    event.preventDefault();
    ul.scrollLeft += delta;
  }, { passive: false });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    ul.classList.remove('is-dragging');
    if (moved) lastDragEnd = Date.now();
    moved = false;
  };
  window.addEventListener('mouseup', endDrag);
  // Releasing outside the browser window can miss mouseup — blur covers it.
  window.addEventListener('blur', endDrag);
  // Swallow the click landing right after a drag or it would navigate.
  ul.addEventListener('click', (event) => {
    if (Date.now() - lastDragEnd < 150) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, { capture: true });
}

// Switch chrome layout per setting; re-rendered on login/logout too.
export function applyShortcutLayout() {
  const merged = getMergeShortcuts();
  document.documentElement.classList.toggle('shortcuts-merged', merged);
  renderNavShortcuts();
  if (merged) {
    renderMergedShortcuts();
    wireMergedScroll();
  }
}

// Wired once at boot so cross-tab settings changes apply immediately.
export function wireNavShortcuts() {
  applyShortcutLayout();
  window.addEventListener('voz:settings', applyShortcutLayout);
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === 'voz-settings:v1') applyShortcutLayout();
  });
  // Anonymous-mode changes must repaint the identity in the top bar.
  window.addEventListener('voz:settings', () => renderAccount());
}

function utilityMenus() {
  return menuButton('dm', 'Hộp thư', ICON_MAIL, '<div class="header-menu-body"></div><a class="menu-footer" href="/direct-messages">Xem tất cả hộp thư</a>') +
    menuButton('alerts', 'Thông báo', ICON_BELL, '<div class="header-menu-body"></div><a class="menu-footer" href="/alerts">Xem tất cả thông báo</a>') +
    menuButton('search', 'Tìm kiếm', ICON_SEARCH, `<form id="header-search" class="quick-search"><input class="input" type="search" name="q" placeholder="Từ khoá…" aria-label="Từ khoá"><input class="input" name="member" placeholder="Bởi: tên thành viên" aria-label="Bởi thành viên"><small class="u-dimmed">Nhập từ khoá hoặc thành viên. Kết hợp bộ lọc: dùng tìm nâng cao.</small><button class="button button--primary" type="submit">Tìm kiếm</button><a href="/forum/search/" target="_blank" rel="noopener">Tìm kiếm nâng cao…</a><a href="/search">Trang tìm kiếm</a></form>`);
}

function accountSwitcherHtml(me) {
  const accounts = Array.isArray(state.accounts) ? state.accounts : [];
  if (!accounts.length) return '';
  const rows = accounts.map((acc) => {
    const isActive = Number(acc.user_id) === Number(me.user_id);
    return `<div class="account-switch-row${isActive ? ' is-active' : ''}" data-switch-user="${acc.user_id}" role="button" tabindex="0">
      <span class="avatar">${avatarMarkup(acc, 's')}</span>
      <span class="account-switch-name">${esc(acc.username || `#${acc.user_id}`)}</span>
      ${isActive
        ? '<span class="account-switch-check" aria-label="Đang dùng">✓</span>'
        : `<button class="account-remove" type="button" data-remove-user="${acc.user_id}" title="Đăng xuất tài khoản này" aria-label="Đăng xuất ${esc(acc.username || '')}">×</button>`}
    </div>`;
  }).join('');
  return `<div class="account-switcher">
    <div class="account-switcher-title">Chuyển tài khoản</div>
    ${rows}
    <a class="account-add" href="/login">+ Thêm tài khoản</a>
  </div>`;
}

export function renderAccount() {
  if (state.loggedIn && state.me) {
    const me = state.me;
    // Anonymous mode swaps the visible identity; profile/menu entries must
    // still use the real account.
    const shown = displayUser(me);
    accountEl.innerHTML = `
      <div class="header-menu-wrap"><button class="account-toggle header-icon" type="button" data-header-menu="account" aria-expanded="false" aria-controls="header-menu-account"><span class="avatar">${avatarMarkup(shown, 's')}</span><span class="username">${esc(shown.username)}</span></button><section class="header-menu account-menu" id="header-menu-account" aria-label="Tài khoản" hidden><h2>${esc(shown.username)}</h2><a href="${userPath(me)}">Hồ sơ</a><a href="/bookmarks">Đánh dấu</a>      <a href="/watched">Theo dõi</a><a href="/cai-dat-tuivoz">Cài đặt</a>${accountSwitcherHtml(me)}<button class="account-logout" id="logout-btn" type="button">${ICON_POWER} Đăng xuất</button></section></div>
            ${utilityMenus()}
    `;
    refreshUnreadCounts();
    const btn = document.getElementById('logout-btn');
    if (btn) {
      btn.addEventListener('click', async () => {
        // Logout drops the active account only; the server promotes a survivor.
        const res = await auth.logout(me.user_id);
        if (res && res.loggedOut === false) {
          toast('Đã đăng xuất — chuyển sang tài khoản còn lại');
          location.reload();
          return;
        }
        state.loggedIn = false;
        state.me = null;
        state.accounts = [];
        renderAccount();
        toast('Đã đăng xuất');
        navigate('/');
      });
    }
    // Account switcher: click a row to switch, × to drop that account.
    const menu = document.getElementById('header-menu-account');
    menu?.querySelectorAll('[data-switch-user]').forEach((row) => {
      const userId = Number(row.dataset.switchUser);
      if (userId === Number(me.user_id)) return;
      const switchTo = async () => {
        row.classList.add('is-switching');
        const { ok, data } = await auth.switchAccount(userId);
        if (!ok) {
          row.classList.remove('is-switching');
          toast(data?.detail || 'Không chuyển được tài khoản — có thể cần đăng nhập lại.', true);
          return;
        }
        toast(`Đã chuyển sang ${data.me.username}`);
        // Full reload: every cached view (unread counts, reactions…) is per-user.
        location.reload();
      };
      row.addEventListener('click', (event) => {
        if (event.target.closest('.account-remove')) return;
        switchTo();
      });
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          switchTo();
        }
      });
    });
    menu?.querySelectorAll('[data-remove-user]').forEach((removeBtn) => {
      removeBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const userId = Number(removeBtn.dataset.removeUser);
        await auth.logout(userId);
        state.accounts = state.accounts.filter((acc) => Number(acc.user_id) !== userId);
        toast('Đã đăng xuất tài khoản đó');
        renderAccount();
      });
    });
  } else {
    accountEl.innerHTML = `<a class="button button--small button--primary" href="/login">Đăng nhập</a>${utilityMenus()}`;
  }
}

export function setBreadcrumbs(items, action) {
  if (!items || !items.length) {
    breadcrumbsEl.innerHTML = '';
    return;
  }
  breadcrumbsEl.innerHTML = items
    .map((item, index) => {
      const label = esc(item.label);
      const node = item.href ? `<a href="${esc(item.href)}">${label}</a>` : `<span>${label}</span>`;
      return index ? `<span class="sep">›</span>${node}` : node;
    })
    .join('');
  if (action) {
    const external = action.href && !action.href.startsWith('/');
    const extra = external ? ' target="_blank" rel="noopener"' : '';
    breadcrumbsEl.innerHTML = `<div class="breadcrumb-trail">${breadcrumbsEl.innerHTML}</div><a class="button button--cta" href="${esc(action.href)}"${extra}>${ICON_EDIT} ${esc(action.label)}</a>`;
  }
}

export function setActiveNav(name) {
  for (const link of navEl.querySelectorAll('a')) {
    link.classList.toggle('is-active', link.dataset.nav === name);
  }
}

import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { navForRole } from '../lib/roles';
import { switchLanguage } from '../i18n';
import { supabase } from '../lib/supabase';

export default function Layout() {
  const { t, i18n } = useTranslation();
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!profile) return null;
  const items = navForRole(profile.role);
  const displayName = i18n.language === 'ar' && profile.full_name_ar ? profile.full_name_ar : profile.full_name;

  async function toggleLanguage() {
    const next = i18n.language === 'ar' ? 'en' : 'ar';
    switchLanguage(next);
    if (profile) await supabase.from('profiles').update({ lang: next }).eq('id', profile.id);
  }

  const nav = (
    <nav className="flex-1 py-4 space-y-1">
      {items.map((item) => (
        <NavLink
          key={item.key}
          to={item.path}
          end={item.path === '/'}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            `block px-5 py-2.5 text-sm font-medium border-s-4 ${
              isActive
                ? 'border-brand-red bg-white/10 text-white'
                : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
            }`
          }
        >
          {t(`nav.${item.key}`)}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col bg-brand-black">
        <div className="px-5 py-5">
          <span dir="ltr" className="inline-block text-3xl font-extrabold text-white">
            MD<span className="text-brand-red">.</span>
          </span>
        </div>
        {nav}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b flex items-center justify-between px-4 h-14 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden text-2xl font-bold"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu"
            >
              ☰
            </button>
            <span dir="ltr" className="md:hidden inline-block text-xl font-extrabold">
              MD<span className="text-brand-red">.</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleLanguage}
              className="text-sm font-semibold text-gray-700 hover:text-brand-red"
            >
              {t('header.language')}
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium hidden sm:block">{displayName}</span>
              <span className="text-xs bg-gray-200 rounded px-2 py-0.5">{t(`roles.${profile.role}`)}</span>
            </div>
            <button onClick={signOut} className="text-sm text-gray-500 hover:text-brand-red">
              {t('header.signOut')}
            </button>
          </div>
        </header>

        {/* Sidebar (mobile drawer) */}
        {menuOpen && (
          <div className="md:hidden bg-brand-black">{nav}</div>
        )}

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

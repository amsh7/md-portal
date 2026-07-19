import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { switchLanguage } from '../i18n';

export default function Login() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(t('login.error'));
    setBusy(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-black px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span dir="ltr" className="inline-block text-5xl font-extrabold text-white">
            MD<span className="text-brand-red">.</span>
          </span>
          <p className="text-gray-400 mt-2 text-sm">{t('app.company')}</p>
        </div>
        <form onSubmit={onSubmit} className="bg-white rounded-lg shadow-lg p-6 space-y-4">
          <h1 className="text-lg font-bold">{t('login.title')}</h1>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="email">
              {t('login.email')}
            </label>
            <input
              id="email"
              type="email"
              dir="ltr"
              required
              autoComplete="username"
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-red"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="password">
              {t('login.password')}
            </label>
            <input
              id="password"
              type="password"
              dir="ltr"
              required
              autoComplete="current-password"
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-red"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-brand-red">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-brand-red text-white font-semibold rounded py-2.5 hover:bg-red-700 disabled:opacity-50"
          >
            {t('login.submit')}
          </button>
        </form>
        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-gray-400 hover:text-white"
          onClick={() => switchLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
        >
          {t('header.language')}
        </button>
      </div>
    </div>
  );
}

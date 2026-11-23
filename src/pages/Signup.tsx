import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { switchLanguage } from '../i18n';

const fieldCls = 'w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-red';

export default function Signup() {
  const { t, i18n } = useTranslation();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDetail(null);
    try {
      // Pre-check the invite code so the error is clear (the DB enforces it again).
      const { data: ok, error: checkErr } = await supabase.rpc('check_invite', { p_code: code });
      if (checkErr) throw checkErr;
      if (!ok) {
        setError(t('signup.invalidCode'));
        return;
      }
      const { data, error: signErr } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { invite_code: code.trim().toUpperCase(), full_name: name.trim() } },
      });
      if (signErr) {
        setError(
          /invite/i.test(signErr.message)
            ? t('signup.invalidCode')
            : /already|exists|registered/i.test(signErr.message)
              ? t('signup.emailExists')
              : /password/i.test(signErr.message)
                ? t('signup.weakPassword')
                : t('common.error'),
        );
        setDetail(signErr.message);
        return;
      }
      if (!data.session) {
        // email confirmation still enabled in Supabase settings
        setNotice(t('signup.confirmEmail'));
      }
      // with confirmation disabled, the session starts and the app loads by itself
    } finally {
      setBusy(false);
    }
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
        {notice ? (
          <div className="bg-white rounded-lg shadow-lg p-6 space-y-4 text-center">
            <p className="text-sm">{notice}</p>
            <a href="#/" className="text-brand-red font-medium text-sm" onClick={() => window.location.reload()}>
              {t('signup.backToLogin')}
            </a>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="bg-white rounded-lg shadow-lg p-6 space-y-4">
            <h1 className="text-lg font-bold">{t('signup.title')}</h1>
            <p className="text-xs text-gray-500">{t('signup.hint')}</p>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="code">{t('signup.invite')}</label>
              <input
                id="code" dir="ltr" required autoComplete="off"
                className={`${fieldCls} font-mono uppercase tracking-widest`}
                value={code} onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="name">{t('signup.name')}</label>
              <input id="name" required className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="email">{t('login.email')}</label>
              <input
                id="email" type="email" dir="ltr" required autoComplete="username"
                className={fieldCls} value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="password">{t('login.password')}</label>
              <input
                id="password" type="password" dir="ltr" required minLength={8} autoComplete="new-password"
                className={fieldCls} value={password} onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">{t('signup.passwordHint')}</p>
            </div>
            {error && <p className="text-sm text-brand-red">{error}</p>}
            {detail && <p className="text-xs text-gray-400" dir="ltr">({detail})</p>}
            <button
              type="submit" disabled={busy || !code.trim() || !name.trim()}
              className="w-full bg-brand-red text-white font-semibold rounded py-2.5 hover:bg-red-700 disabled:opacity-50"
            >
              {t('signup.submit')}
            </button>
            <a href="#/" className="block text-center text-sm text-gray-500 hover:text-brand-red">
              {t('signup.backToLogin')}
            </a>
          </form>
        )}
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

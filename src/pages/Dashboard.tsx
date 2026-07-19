import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface Announcement {
  id: string;
  title: string;
  title_ar: string | null;
  body: string;
  body_ar: string | null;
  created_at: string;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const ar = i18n.language === 'ar';

  const { data: announcements } = useQuery({
    queryKey: ['announcements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as Announcement[];
    },
  });

  const displayName =
    ar && profile?.full_name_ar ? profile.full_name_ar : profile?.full_name ?? '';

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-bold">{t('dashboard.welcome', { name: displayName })}</h1>

      <section className="bg-white rounded-lg border">
        <h2 className="px-4 py-3 border-b font-semibold text-sm">{t('dashboard.announcements')}</h2>
        {!announcements?.length ? (
          <p className="px-4 py-6 text-sm text-gray-500">{t('dashboard.noAnnouncements')}</p>
        ) : (
          <ul className="divide-y">
            {announcements.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-sm">{ar && a.title_ar ? a.title_ar : a.title}</span>
                  <span className="text-xs text-gray-400 shrink-0">{formatDate(a.created_at)}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">
                  {ar && a.body_ar ? a.body_ar : a.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

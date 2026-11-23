import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { fmtDate } from '../../lib/format';
import { EmptyState, ErrorNote, Field, Loading, Modal, PrimaryButton, inputCls } from '../../components/ui';

interface Announcement {
  id: string;
  title: string;
  title_ar: string | null;
  body: string;
  body_ar: string | null;
  created_at: string;
}

const empty = { title: '', title_ar: '', body: '', body_ar: '' };

export default function AnnouncementsAdmin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<(typeof empty & { id?: string }) | null>(null);

  const { data: announcements, isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements').select('*')
        .order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data as Announcement[];
    },
  });

  const save = useMutation({
    mutationFn: async (a: typeof empty & { id?: string }) => {
      const row = {
        title: a.title,
        title_ar: a.title_ar || null,
        body: a.body,
        body_ar: a.body_ar || null,
      };
      const { error } = a.id
        ? await supabase.from('announcements').update(row).eq('id', a.id)
        : await supabase.from('announcements').insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('announcements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex justify-end">
        <PrimaryButton onClick={() => setEditing({ ...empty })}>{t('hr.newAnnouncement')}</PrimaryButton>
      </div>
      <div className="bg-white rounded-lg border divide-y">
        {!announcements?.length && <EmptyState hint={t('dashboard.noAnnouncements')} />}
        {announcements?.map((a) => (
          <div key={a.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-sm">{a.title}</span>
              <span className="text-xs text-gray-400 shrink-0">{fmtDate(a.created_at)}</span>
            </div>
            {a.title_ar && <p className="text-sm" dir="rtl">{a.title_ar}</p>}
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{a.body}</p>
            <div className="mt-2 text-sm space-x-3 rtl:space-x-reverse">
              <button
                className="text-brand-red"
                onClick={() => setEditing({ id: a.id, title: a.title, title_ar: a.title_ar ?? '', body: a.body, body_ar: a.body_ar ?? '' })}
              >
                {t('common.edit')}
              </button>
              <button
                className="text-gray-400"
                onClick={() => window.confirm(t('common.confirmDelete')) && remove.mutate(a.id)}
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <Modal title={t(editing.id ? 'common.edit' : 'hr.newAnnouncement')} onClose={() => setEditing(null)}>
          <form
            onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(editing); }}
            className="space-y-3"
          >
            <Field label={t('hr.annTitle')} required>
              <input className={inputCls} required value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </Field>
            <Field label={t('hr.annTitleAr')}>
              <input className={inputCls} dir="rtl" value={editing.title_ar} onChange={(e) => setEditing({ ...editing, title_ar: e.target.value })} />
            </Field>
            <Field label={t('hr.annBody')} required>
              <textarea className={inputCls} rows={3} required value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
            </Field>
            <Field label={t('hr.annBodyAr')}>
              <textarea className={inputCls} dir="rtl" rows={3} value={editing.body_ar} onChange={(e) => setEditing({ ...editing, body_ar: e.target.value })} />
            </Field>
            {save.isError && <ErrorNote message={t('common.error')} />}
            <div className="flex justify-end gap-2">
              <button type="button" className="text-sm text-gray-500 px-3" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
              <PrimaryButton type="submit" disabled={save.isPending}>{t('common.save')}</PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

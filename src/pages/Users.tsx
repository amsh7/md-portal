import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { ALL_ROLES, DEPARTMENTS, Profile, Role } from '../lib/roles';
import { InviteCode, generateInviteCode } from '../lib/hr';
import { fmtDate } from '../lib/format';
import { ErrorNote, PrimaryButton, inputCls } from '../components/ui';

function InvitesPanel({ profiles }: { profiles: Profile[] | undefined }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [role, setRole] = useState<Role>('employee');
  const [department, setDepartment] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const profileNames: Record<string, string> = {};
  for (const p of profiles ?? []) profileNames[p.id] = p.full_name;

  const { data: invites } = useQuery({
    queryKey: ['invites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invite_codes').select('*')
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data as InviteCode[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('invite_codes').insert({
        code: generateInviteCode(),
        role,
        department: department || null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites'] }),
  });

  const remove = useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase.from('invite_codes').delete().eq('code', code);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites'] }),
  });

  function copy(code: string) {
    const url = `${window.location.origin}${window.location.pathname}#/signup`;
    navigator.clipboard.writeText(t('users.inviteMessage', { code, url }));
    setCopied(code);
    setTimeout(() => setCopied(null), 2500);
  }

  return (
    <div className="bg-white rounded-lg border">
      <div className="px-4 py-3 border-b">
        <h2 className="font-semibold text-sm">{t('users.invitesTitle')}</h2>
        <p className="text-xs text-gray-500 mt-1">{t('users.invitesHint')}</p>
      </div>
      <div className="px-4 py-3 flex flex-wrap items-end gap-3 border-b">
        <label className="block">
          <span className="block text-xs font-medium mb-1">{t('users.role')}</span>
          <select className={`${inputCls} w-auto`} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ALL_ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium mb-1">{t('users.department')}</span>
          <select className={`${inputCls} w-auto`} value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">{t('common.none')}</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <PrimaryButton disabled={create.isPending} onClick={() => create.mutate()}>
          {t('users.newInvite')}
        </PrimaryButton>
      </div>
      {(create.isError || remove.isError) && <div className="px-4"><ErrorNote message={t('common.error')} /></div>}
      <div className="divide-y">
        {!invites?.length && (
          <p className="px-4 py-5 text-sm text-gray-500">{t('users.noInvites')}</p>
        )}
        {invites?.map((inv) => (
          <div key={inv.code} className="px-4 py-2.5 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-mono font-bold tracking-widest" dir="ltr">{inv.code}</span>
            <span className="text-xs bg-gray-100 rounded px-2 py-0.5">{t(`roles.${inv.role}`)}</span>
            {inv.department && <span className="text-xs text-gray-500">{inv.department}</span>}
            <span className="ms-auto text-xs text-gray-400">{fmtDate(inv.created_at)}</span>
            {inv.used_by ? (
              <span className="text-xs text-green-700">
                {t('users.inviteUsedBy', { name: profileNames[inv.used_by] ?? '—' })}
              </span>
            ) : (
              <>
                <button className="text-brand-red text-sm font-medium" onClick={() => copy(inv.code)}>
                  {copied === inv.code ? t('users.copied') : t('users.copyInvite')}
                </button>
                <button
                  className="text-gray-400 text-sm"
                  onClick={() => window.confirm(t('common.confirmDelete')) && remove.mutate(inv.code)}
                >
                  {t('common.delete')}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface EditState {
  id: string;
  full_name: string;
  full_name_ar: string;
  role: Role;
  department: string;
  phone: string;
}

export default function Users() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');
      if (error) throw error;
      return data as Profile[];
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<Profile> & { id: string }) => {
      const { id, ...fields } = patch;
      const { error } = await supabase.from('profiles').update(fields).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] });
      setEditing(null);
      setMessage(t('users.saved'));
      setTimeout(() => setMessage(null), 2500);
    },
    onError: () => setMessage(t('users.error')),
  });

  function toggleActive(u: Profile) {
    const name = i18n.language === 'ar' && u.full_name_ar ? u.full_name_ar : u.full_name;
    if (u.active && !window.confirm(t('users.confirmDeactivate', { name }))) return;
    save.mutate({ id: u.id, active: !u.active });
  }

  if (isLoading) return <p className="text-sm text-gray-500">{t('common.loading')}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('users.title')}</h1>
        {message && <span className="text-sm text-gray-600">{message}</span>}
      </div>

      <InvitesPanel profiles={users} />

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-start">
              <th className="px-4 py-2.5 text-start font-semibold">{t('users.name')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('users.role')}</th>
              <th className="px-4 py-2.5 text-start font-semibold hidden sm:table-cell">{t('users.department')}</th>
              <th className="px-4 py-2.5 text-start font-semibold hidden md:table-cell">{t('users.phone')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('users.active')}</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!users?.length && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  {t('users.empty')}
                </td>
              </tr>
            )}
            {users?.map((u) =>
              editing?.id === u.id ? (
                <tr key={u.id} className="bg-red-50/50">
                  <td className="px-4 py-2 space-y-1">
                    <input
                      className="w-full border rounded px-2 py-1"
                      value={editing.full_name}
                      placeholder={t('users.name')}
                      onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                    />
                    <input
                      className="w-full border rounded px-2 py-1"
                      dir="rtl"
                      value={editing.full_name_ar}
                      placeholder={t('users.nameAr')}
                      onChange={(e) => setEditing({ ...editing, full_name_ar: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className="border rounded px-2 py-1"
                      value={editing.role}
                      onChange={(e) => setEditing({ ...editing, role: e.target.value as Role })}
                    >
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`roles.${r}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2 hidden sm:table-cell">
                    <select
                      className="border rounded px-2 py-1"
                      value={editing.department}
                      onChange={(e) => setEditing({ ...editing, department: e.target.value })}
                    >
                      <option value="">{t('common.none')}</option>
                      {DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2 hidden md:table-cell">
                    <input
                      className="w-full border rounded px-2 py-1"
                      dir="ltr"
                      value={editing.phone}
                      onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2">{u.active ? t('users.active') : t('users.inactive')}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-end">
                    <button
                      className="text-white bg-brand-red rounded px-3 py-1 me-2 font-medium"
                      onClick={() =>
                        save.mutate({
                          id: editing.id,
                          full_name: editing.full_name,
                          full_name_ar: editing.full_name_ar || null,
                          role: editing.role,
                          department: editing.department || null,
                          phone: editing.phone || null,
                        })
                      }
                    >
                      {t('users.save')}
                    </button>
                    <button className="text-gray-500 px-2 py-1" onClick={() => setEditing(null)}>
                      {t('users.cancel')}
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={u.id} className={u.active ? '' : 'opacity-50'}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{u.full_name}</div>
                    {u.full_name_ar && <div className="text-gray-500" dir="rtl">{u.full_name_ar}</div>}
                  </td>
                  <td className="px-4 py-2.5">{t(`roles.${u.role}`)}</td>
                  <td className="px-4 py-2.5 hidden sm:table-cell">{u.department ?? t('common.none')}</td>
                  <td className="px-4 py-2.5 hidden md:table-cell" dir="ltr">
                    {u.phone ?? t('common.none')}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-xs rounded px-2 py-0.5 ${
                        u.active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {u.active ? t('users.active') : t('users.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-end">
                    <button
                      className="text-brand-red font-medium me-3"
                      onClick={() =>
                        setEditing({
                          id: u.id,
                          full_name: u.full_name,
                          full_name_ar: u.full_name_ar ?? '',
                          role: u.role,
                          department: u.department ?? '',
                          phone: u.phone ?? '',
                        })
                      }
                    >
                      {t('users.edit')}
                    </button>
                    <button className="text-gray-500" onClick={() => toggleActive(u)}>
                      {u.active ? t('users.deactivate') : t('users.activate')}
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

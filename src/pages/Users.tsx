import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { ALL_ROLES, DEPARTMENTS, Profile, Role } from '../lib/roles';

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

      <p className="text-sm text-gray-500 bg-white border rounded-lg px-4 py-3">
        {t('users.inviteHint')}
      </p>

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

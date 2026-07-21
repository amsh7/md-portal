import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useLocations } from '../../lib/queries';
import { EmptyState, ErrorNote, Field, Loading, Modal, PrimaryButton, inputCls } from '../../components/ui';

export default function Locations() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: locations, isLoading } = useLocations();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('locations').insert({ type: 'warehouse', name });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] });
      setAdding(false);
      setName('');
    },
  });

  if (isLoading) return <Loading />;

  const warehouses = (locations ?? []).filter((l) => l.type === 'warehouse');
  const shelves = (locations ?? []).filter((l) => l.type === 'hospital');

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">{t('inv.warehouse')}</h2>
        <PrimaryButton onClick={() => setAdding(true)}>+ {t('inv.newWarehouse')}</PrimaryButton>
      </div>
      <div className="bg-white rounded-lg border divide-y">
        {!warehouses.length && <EmptyState hint={t('inv.emptyLocations')} />}
        {warehouses.map((l) => (
          <div key={l.id} className="px-4 py-3 text-sm font-medium">{l.name}</div>
        ))}
      </div>

      <div>
        <h2 className="font-semibold text-sm mb-2">{t('inv.hospitalShelf')}</h2>
        <p className="text-xs text-gray-500 mb-2">{t('inv.autoLocationHint')}</p>
        <div className="bg-white rounded-lg border divide-y">
          {shelves.map((l) => (
            <div key={l.id} className="px-4 py-3 text-sm">{l.name}</div>
          ))}
        </div>
      </div>

      {adding && (
        <Modal title={t('inv.newWarehouse')} onClose={() => setAdding(false)}>
          <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="space-y-3">
            <Field label={t('inv.warehouseName')} required>
              <input className={inputCls} required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            {add.isError && <ErrorNote message={t('common.error')} />}
            <div className="flex justify-end gap-2">
              <button type="button" className="text-sm text-gray-500 px-3" onClick={() => setAdding(false)}>{t('common.cancel')}</button>
              <PrimaryButton type="submit" disabled={add.isPending}>{t('common.save')}</PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

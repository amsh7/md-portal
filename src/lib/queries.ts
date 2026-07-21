import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { Profile } from './roles';
import { Hospital, Location, Product } from './types';

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('full_name');
      if (error) throw error;
      return data as Profile[];
    },
  });
}

export function useHospitals() {
  return useQuery({
    queryKey: ['hospitals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hospitals').select('*').order('name');
      if (error) throw error;
      return data as Hospital[];
    },
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('sku');
      if (error) throw error;
      return data as Product[];
    },
  });
}

export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('locations').select('*').order('name');
      if (error) throw error;
      return data as Location[];
    },
  });
}

/** id → display string maps, memo-friendly */
export function byId<T extends { id: string }>(rows: T[] | undefined): Record<string, T> {
  const map: Record<string, T> = {};
  for (const r of rows ?? []) map[r.id] = r;
  return map;
}

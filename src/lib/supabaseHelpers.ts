import { supabase } from '@/lib/supabase';

// Generic upsert helper
export const upsertData = async (table: string, data: any[]) => {
  const { error } = await supabase.from(table).upsert(data);
  if (error) throw error;
  return true;
};

export const insertData = async (table: string, data: any[]) => {
  const { error } = await supabase.from(table).insert(data);
  if (error) throw error;
  return true;
};

export const updateData = async (table: string, id: string, updates: any) => {
  const { error } = await supabase.from(table).update(updates).eq('id', id);
  if (error) throw error;
  return true;
};

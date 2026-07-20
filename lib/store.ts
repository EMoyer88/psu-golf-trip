import { supabase } from './supabaseClient';

// Mirrors the shape of the old Claude-artifact window.storage API so the
// rest of the app's logic barely had to change: kvGet/kvSet read and write
// one JSON blob per key in the kv_store table.

export async function kvGet<T = any>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from('kv_store')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) {
    console.error('kvGet error', key, error);
    return null;
  }
  return data ? (data.value as T) : null;
}

export async function kvSet(key: string, value: any): Promise<boolean> {
  const { error } = await supabase
    .from('kv_store')
    .upsert({ key, value }, { onConflict: 'key' });
  if (error) {
    console.error('kvSet error', key, error);
    return false;
  }
  return true;
}

// Subscribe to live changes on a specific key. Calls onChange(newValue)
// whenever any other browser tab/device updates that key. Returns an
// unsubscribe function.
export function kvSubscribe(key: string, onChange: (value: any) => void) {
  const channel = supabase
    .channel(`kv-${key}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'kv_store', filter: `key=eq.${key}` },
      (payload: any) => {
        const row = payload.new ?? payload.old;
        if (row && row.value !== undefined) onChange(row.value);
      }
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// Uploads a File/Blob to the "photos" bucket and returns its public URL.
// Used for both chat photos and expense receipts — this is the piece that
// removes the old 5MB-total ceiling, since each photo is its own object in
// real file storage rather than a base64 string packed into one JSON blob.
export async function uploadPhoto(file: File, folder: string): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('photos').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) {
    console.error('uploadPhoto error', error);
    return null;
  }
  const { data } = supabase.storage.from('photos').getPublicUrl(path);
  return data.publicUrl;
}

// Compresses an image client-side before upload (keeps uploads fast on a
// golf course's spotty cell signal). Returns a File ready for uploadPhoto.
export function compressImage(file: File, maxWidth = 1280, quality = 0.75): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('no canvas context')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('compression failed')); return; }
            resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

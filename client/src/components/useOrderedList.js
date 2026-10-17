import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api.js';
import { useLiveRefresh } from '../live.js';

/** Load / create / update / delete / reorder for an admin-managed ordered list. */
export default function useOrderedList(resource) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    adminApi.get(`/admin/${resource}`).then(setItems).catch((err) => setError(err.message));
  }, [resource]);

  useEffect(reload, [reload]);
  useLiveRefresh(reload);

  const run = async (fn) => {
    setError('');
    try {
      return await fn();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const save = (data, id) => run(async () => {
    const saved = id ? await adminApi.put(`/admin/${resource}/${id}`, data) : await adminApi.post(`/admin/${resource}`, data);
    setItems((list) => (id ? list.map((i) => (i.id === id ? saved : i)) : [...list, saved]));
    return saved;
  });

  const remove = (id) => run(async () => {
    await adminApi.del(`/admin/${resource}/${id}`);
    setItems((list) => list.filter((i) => i.id !== id));
  });

  // Swaps an item with its neighbour in the visible list (e.g. one section) within the full order.
  const move = (visible, index, delta) => run(async () => {
    const a = visible[index];
    const b = visible[index + delta];
    if (!a || !b) return;
    const ids = items.map((i) => i.id);
    const ia = ids.indexOf(a.id);
    const ib = ids.indexOf(b.id);
    [ids[ia], ids[ib]] = [ids[ib], ids[ia]];
    setItems(await adminApi.put(`/admin/${resource}/reorder`, { ids }));
  }).catch(() => reload());

  return { items, setItems, error, setError, save, remove, move, reload };
}

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api.js';

/** Load / create / update / delete / reorder for an admin-managed ordered list. */
export default function useOrderedList(resource) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    adminApi.get(`/admin/${resource}`).then(setItems).catch((err) => setError(err.message));
  }, [resource]);

  useEffect(reload, [reload]);

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

  const move = (index, delta) => run(async () => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const ids = items.map((i) => i.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setItems(await adminApi.put(`/admin/${resource}/reorder`, { ids }));
  }).catch(() => reload());

  return { items, setItems, error, setError, save, remove, move, reload };
}

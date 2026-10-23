// Storage adapter: IndexedDB on this device only. Used by the standalone
// prototype build (dist/wardrobe.html).
export function createStore() {
  let db = null

  function open() {
    return new Promise((resolve, reject) => {
      let req
      try { req = indexedDB.open('fearne-wardrobe', 1) } catch (e) { reject(e); return }
      req.onupgradeneeded = () => {
        req.result.createObjectStore('kv')
        req.result.createObjectStore('photos')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  function tx(name, mode, fn) {
    return new Promise((resolve, reject) => {
      if (!db) { reject(new Error('Storage unavailable')); return }
      const t = db.transaction(name, mode)
      const req = fn(t.objectStore(name))
      t.oncomplete = () => resolve(req?.result)
      t.onerror = () => reject(t.error)
    })
  }

  return {
    kind: 'local',
    async init() {
      db = await open()
      const state = await tx('kv', 'readonly', (s) => s.get('state'))
      const keys = await tx('photos', 'readonly', (s) => s.getAllKeys())
      const vals = await tx('photos', 'readonly', (s) => s.getAll())
      return { state: state || null, photos: new Map(keys.map((k, i) => [k, vals[i]])), updatedAt: null }
    },
    async saveState(state) {
      await tx('kv', 'readwrite', (s) => s.put(state, 'state'))
      return null
    },
    async putPhoto(id, dataURL) {
      await tx('photos', 'readwrite', (s) => s.put(dataURL, id))
      return dataURL
    },
    async deletePhoto(id) {
      await tx('photos', 'readwrite', (s) => s.delete(id))
    },
  }
}

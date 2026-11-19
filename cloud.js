// Sign in with Google + sync through Firebase (Auth + Firestore). Data lives under users/{uid}/…
const V = '10.14.1', CDN = `https://www.gstatic.com/firebasejs/${V}`;
const [{ initializeApp }, A, F] = await Promise.all([
  import(`${CDN}/firebase-app.js`), import(`${CDN}/firebase-auth.js`), import(`${CDN}/firebase-firestore.js`),
]);

export function start(cfg, h) {
  const app = initializeApp(cfg);
  const auth = A.getAuth(app);
  auth.useDeviceLanguage();
  const db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  if (cfg.emulator) {
    A.connectAuthEmulator(auth, `http://${cfg.emulator}:9099`, { disableWarnings: true });
    F.connectFirestoreEmulator(db, cfg.emulator, 8080);
  }
  let uid = null, ready = false, unsubs = [], timer = 0, pushing = Promise.resolve();
  const known = new Map(), knownRefs = new Map();
  const col = (n) => F.collection(db, 'users', uid, n);
  const ref = (n, id) => F.doc(db, 'users', uid, n, id);
  const stamp = () => ({ by: h.device, at: F.serverTimestamp() });

  A.getRedirectResult(auth).catch((e) => h.status(null, 'Sign-in failed: ' + (e.code || e.message)));
  A.onAuthStateChanged(auth, async (u) => {
    unsubs.forEach((f) => f()); unsubs = []; ready = false; known.clear(); knownRefs.clear();
    uid = u ? u.uid : null;
    h.status(u, u ? 'syncing…' : '');
    if (!u) return;
    try {
      const [ds, rs] = await Promise.all([F.getDocs(col('data')), F.getDocs(col('refs'))]);
      const remote = {};
      ds.forEach((d) => { known.set(d.id, d.data().v); remote[d.id] = JSON.parse(d.data().v); });
      const remoteRefs = rs.docs.map((d) => { knownRefs.set(d.id, d.data().v); return JSON.parse(d.data().v); });
      h.merge(remote, remoteRefs, u.uid);
      ready = true;
      await push();
      unsubs.push(F.onSnapshot(col('data'), (snap) => {
        const ch = {};
        snap.docChanges().forEach((c) => {
          if (c.type === 'removed' || c.doc.metadata.hasPendingWrites) return;
          const v = c.doc.data().v;
          if (known.get(c.doc.id) !== v) { known.set(c.doc.id, v); ch[c.doc.id] = JSON.parse(v); }
        });
        if (Object.keys(ch).length) h.apply(ch, null);
      }));
      unsubs.push(F.onSnapshot(col('refs'), (snap) => {
        let changed = false;
        snap.docChanges().forEach((c) => {
          if (c.doc.metadata.hasPendingWrites) return;
          if (c.type === 'removed') { if (knownRefs.delete(c.doc.id)) changed = true; return; }
          const v = c.doc.data().v;
          if (knownRefs.get(c.doc.id) !== v) { knownRefs.set(c.doc.id, v); changed = true; }
        });
        if (changed) h.apply(null, [...knownRefs.values()].map((v) => JSON.parse(v)));
      }));
      h.status(u, 'synced');
    } catch (e) { h.status(u, 'sync error: ' + (e.code || e.message)); }
  });

  function push() {
    pushing = pushing.then(async () => {
      if (!uid || !ready) return;
      const w = [];
      for (const [k, val] of Object.entries(h.data())) {
        const v = JSON.stringify(val);
        if (known.get(k) !== v) { known.set(k, v); w.push(F.setDoc(ref('data', k), { v, ...stamp() })); }
      }
      const ids = new Set();
      for (const r of h.refs()) {
        ids.add(r.id);
        const v = JSON.stringify(r);
        if (knownRefs.get(r.id) !== v) { knownRefs.set(r.id, v); w.push(F.setDoc(ref('refs', r.id), { v, ...stamp() })); }
      }
      for (const id of [...knownRefs.keys()]) {
        if (ids.has(id)) continue;
        knownRefs.delete(id);
        w.push(F.deleteDoc(ref('refs', id)), F.deleteDoc(ref('photos', id)));
      }
      await Promise.all(w);
      h.pushed();
    }).catch((e) => h.status(auth.currentUser, 'sync error: ' + (e.code || e.message)));
    return pushing;
  }

  return {
    dirty() { clearTimeout(timer); timer = setTimeout(push, 800); },
    push,
    async signIn() {
      const p = new A.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      try { await A.signInWithPopup(auth, p); } catch (e) {
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) await A.signInWithRedirect(auth, p);
        else if (e.code !== 'auth/popup-closed-by-user') throw e;
      }
    },
    signOut: () => A.signOut(auth),
    async putPhoto(id, data) { if (uid) await F.setDoc(ref('photos', id), { data, ...stamp() }); },
    async getPhoto(id) { if (!uid) return null; const d = await F.getDoc(ref('photos', id)); return d.exists() ? d.data().data : null; },
  };
}

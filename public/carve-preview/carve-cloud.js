// CARVE's account save on fearne.org (decision 0012).
//
// CARVE is served from fearne.org/carve/, the same origin as Fearne Hub, so the hub's
// Supabase login (kept by supabase-js in this origin's localStorage) is already here.
// This file makes a client with the hub's public project URL and publishable key (the
// same ones in fearne-hub's src/supabaseClient.js; Row Level Security, not secrecy,
// guards the data), which picks that session up and keeps it refreshed.
//
// Godot calls these through JavaScriptBridge. Each call starts a job and returns its id;
// the game polls carveCloud.poll(id) each frame until it returns a JSON string
// {done, ok, data, error}. Nothing here knows a game rule.
(function () {
  var URL = 'https://zcfidrjkpobpetxqmjiy.supabase.co';
  var KEY = 'sb_publishable_5OiN2Gtpt2xAyFa4k4terQ_yv9EPlM_';
  var client = null;
  try {
    if (window.supabase && window.supabase.createClient) {
      client = window.supabase.createClient(URL, KEY);
    }
  } catch (e) {
    client = null;
  }
  var jobs = {};
  var nextId = 1;

  function run(fn) {
    var id = nextId++;
    jobs[id] = null;
    Promise.resolve()
      .then(fn)
      .then(function (data) {
        jobs[id] = { done: true, ok: true, data: data === undefined ? null : data, error: '' };
      }, function (err) {
        jobs[id] = { done: true, ok: false, data: null, error: String((err && err.message) || err) };
      });
    return id;
  }

  async function session() {
    var res = await client.auth.getSession();
    if (res.error) throw res.error;
    return res.data.session;
  }

  window.carveCloud = {
    available: function () { return client !== null; },

    // {id, name, approved} for the signed-in hub user, or null when signed out.
    whoami: function () {
      return run(async function () {
        var s = await session();
        if (!s) return null;
        var prof = await client.from('profiles').select('approved, display_name').eq('id', s.user.id).maybeSingle();
        var p = prof.data || {};
        return { id: s.user.id, name: p.display_name || s.user.email, approved: !!p.approved };
      });
    },

    // The account's save in this slot ('live' or 'preview'), or null when there is none.
    load: function (slot) {
      return run(async function () {
        var s = await session();
        if (!s) throw new Error('signed_out');
        var res = await client.from('carve_saves').select('profile, hunts, build, updated_at')
          .eq('user_id', s.user.id).eq('slot', slot).maybeSingle();
        if (res.error) throw res.error;
        return res.data;
      });
    },

    save: function (slot, profile, hunts, build) {
      return run(async function () {
        var s = await session();
        if (!s) throw new Error('signed_out');
        var res = await client.from('carve_saves').upsert({
          user_id: s.user.id, slot: slot, profile: profile, hunts: hunts, build: build,
          updated_at: new Date().toISOString()
        });
        if (res.error) throw res.error;
        return true;
      });
    },

    poll: function (id) {
      var j = jobs[id];
      if (!j) return '';
      delete jobs[id];
      return JSON.stringify(j);
    },

    // The hub's sign-in page; after signing in, open CARVE from the hub again.
    signIn: function () { window.location.href = '/login'; }
  };
})();

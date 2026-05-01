// CYPARK — In-browser data store (IndexedDB for large data capacity)
// Replaces localStorage with IndexedDB; all API calls are async-wrapped
// with a synchronous-looking cache layer so existing code still works.

const Store = (() => {
  const DB_NAME = 'cypark_db';
  const DB_VERSION = 2;
  const STORE_NAME = 'kv';

  let _cache = {};
  let _ready = false;
  let _readyCallbacks = [];
  let _db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME))
          db.createObjectStore(STORE_NAME, { keyPath: 'k' });
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = () => reject(req.error);
    });
  }

  function dbSet(key, val) {
    if (!_db) return;
    try {
      const tx = _db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ k: key, v: val });
    } catch(e) {}
  }

  async function dbGetAll() {
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const map = {};
        (req.result || []).forEach(item => { map[item.k] = item.v; });
        resolve(map);
      };
      req.onerror = () => reject(req.error);
    });
  }

  function get(key) { return _cache[key] !== undefined ? _cache[key] : null; }
  function set(key, val) { _cache[key] = val; dbSet(key, val); return true; }

  function initDefaults() {
    if (get('initialized')) return;
    const users = [{
      username: 'admin',
      password: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
      name: 'Administrator',
      email: 'admin@cypark.ph',
      role: 'admin',
      created: new Date().toISOString(),
      blocked: false,
      failed_logins: 0,
      last_login: null,
      discount_type: 'none',
      id_card_data: null,
      id_card_verified: false
    }];
    set('users', users);
    const slots = [];
    ['A','B','C'].forEach(floor => {
      ['North','South'].forEach(zone => {
        for (let i=1;i<=5;i++) {
          const sid=`${floor}${zone[0]}-${String(i).padStart(2,'0')}`;
          slots.push({slot_id:sid,floor,zone,occupied:false,plate:null,session_id:null,entry_time:null,slot_type:'regular',reserved:false,reserved_by:null,reserved_until:null});
        }
      });
    });
    set('slots', slots);
    set('sessions', []);
    set('reservations', []);
    set('transactions', []);
    set('payments', []);
    set('violations', []);
    set('notifications', []);
    set('queue', []);
    set('login_history', []);
    set('settings', {
      rate_per_hour:40, penalty_per_hour:20, max_stay_hours:24, slot_count:30,
      discount_senior:0.20, discount_pwd:0.20, emergency_mode:false,
      grace_period_minutes:15, brute_force_limit:5, reservation_fee:50
    });
    set('initialized', true);
  }

  async function boot() {
    try {
      _db = await openDB();
      const all = await dbGetAll();
      _cache = all;
      // Migrate from localStorage if needed
      if (!_cache['initialized']) {
        ['users','slots','sessions','reservations','transactions','payments',
         'violations','notifications','queue','settings','initialized'].forEach(k => {
          try {
            const v = localStorage.getItem('cypark_' + k);
            if (v !== null) _cache[k] = JSON.parse(v);
          } catch(e) {}
        });
      }
    } catch(e) { console.warn('IndexedDB unavailable, using memory cache:', e); }

    initDefaults();

    // ── FORCE CORRECT ADMIN PASSWORD ─────────────────────────
    // Fixes cases where old wrong hash (admin1) was stored in IndexedDB.
    // The correct hash is SHA-256 of "admin".
    const CORRECT_ADMIN_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
    const allUsers = get('users') || [];
    const adminUser = allUsers.find(u => u.username === 'admin');
    if (adminUser && adminUser.password !== CORRECT_ADMIN_HASH) {
      adminUser.password = CORRECT_ADMIN_HASH;
      adminUser.failed_logins = 0;
      set('users', allUsers);
    }

    // Ensure all users have discount/id fields
    const users = get('users') || [];
    let changed = false;
    users.forEach(u => {
      if (!u.discount_type) { u.discount_type = 'none'; changed = true; }
      if (u.id_card_data === undefined) { u.id_card_data = null; changed = true; }
      if (u.id_card_verified === undefined) { u.id_card_verified = false; changed = true; }
    });
    if (changed) set('users', users);

    _ready = true;
    _readyCallbacks.forEach(fn => fn());
    _readyCallbacks = [];
  }

  function onReady(fn) { if (_ready) fn(); else _readyCallbacks.push(fn); }
  function _forceReady() {
    if (_ready) return;
    initDefaults();
    _ready = true;
    _readyCallbacks.forEach(fn => fn());
    _readyCallbacks = [];
  }

  function getUsers()        { return get('users') || []; }
  function getSlots()        { return get('slots') || []; }
  function getSessions()     { return get('sessions') || []; }
  function getReservations() { return get('reservations') || []; }
  function getTransactions() { return get('transactions') || []; }
  function getPayments()     { return get('payments') || []; }
  function getViolations()   { return get('violations') || []; }
  function getNotifications(){ return get('notifications') || []; }
  function getQueue()        { return get('queue') || []; }
  function getSettings()     { return get('settings') || {}; }
  function getLoginHistory() { return get('login_history') || []; }
  function saveLoginHistory(d){ set('login_history', d); }

  function saveUsers(d)         { set('users', d); }
  function saveSlots(d)         { set('slots', d); }
  function saveSessions(d)      { set('sessions', d); }
  function saveReservations(d)  { set('reservations', d); }
  function saveTransactions(d)  { set('transactions', d); }
  function savePayments(d)      { set('payments', d); }
  function saveViolations(d)    { set('violations', d); }
  function saveNotifications(d) { set('notifications', d); }
  function saveQueue(d)         { set('queue', d); }
  function saveSettings(d)      { set('settings', d); }

  function getCashierLocation() {
    return get('cashier_location') || {
      name: 'SM Fairview Parking Cashier',
      address: 'Ground Floor, Near Main Entrance Gate, SM Fairview, Quirino Hwy, Novaliches, QC',
      hours: 'Mon–Sun: 8:00 AM – 10:00 PM',
      notes: 'Look for the blue CYPARK booth near the exit barrier.',
      updated: null
    };
  }
  function saveCashierLocation(data) {
    set('cashier_location', data);
    window.dispatchEvent(new CustomEvent('cypark:cashier_update'));
  }

  function genId(len=12) {
    const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let r='';for(let i=0;i<len;i++)r+=chars[Math.floor(Math.random()*chars.length)];return r;
  }
  function shortId(len=8){return genId(len);}

  async function hashPw(pw) {
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pw));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  function addNotification(username,message,type='info') {
    const notifs=getNotifications();
    notifs.unshift({id:shortId(),username,message,type,created:new Date().toISOString(),read:false});
    if(notifs.length>200)notifs.splice(200);
    saveNotifications(notifs);
    window.dispatchEvent(new CustomEvent('cypark:notification',{detail:{username,message,type}}));
  }

  function recommendSlot(preference='nearest_exit') {
    const slots=getSlots();
    const vacant=slots.filter(s=>!s.occupied&&!s.reserved);
    if(!vacant.length)return{slot:null,path:null};
    const floorOrder={A:0,B:1,C:2};
    if(preference==='nearest_exit'){
      vacant.sort((a,b)=>floorOrder[a.floor]-floorOrder[b.floor]||a.slot_id.localeCompare(b.slot_id));
    }else{
      const counts={};
      ['A','B','C'].forEach(f=>{counts[f]=slots.filter(s=>s.floor===f&&s.occupied).length;});
      vacant.sort((a,b)=>counts[a.floor]-counts[b.floor]||a.slot_id.localeCompare(b.slot_id));
    }
    const best=vacant[0];
    const paths={A:'Ground Level — Enter main gate, proceed straight',B:'Level 2 — Take ramp at entrance, turn right',C:'Rooftop — Take ramp to top level, open parking'};
    return{slot:best.slot_id,path:paths[best.floor]||'Follow directional signs'};
  }

  function getAnalytics(period='week') {
    const slots=getSlots(),sessions=getSessions(),payments=getPayments();
    const now=new Date(),total=slots.length,occupied=slots.filter(s=>s.occupied).length;
    const today=now.toISOString().slice(0,10);
    const revToday=payments.filter(p=>p.created&&p.created.startsWith(today)).reduce((s,p)=>s+(p.total||0),0);
    const days=period==='month'?30:7;
    const revenue_chart=[];
    for(let i=0;i<days;i++){
      const d=new Date(now);d.setDate(d.getDate()-(days-1-i));
      const ds=d.toISOString().slice(0,10);
      const amt=payments.filter(p=>p.created&&p.created.startsWith(ds)).reduce((s,p)=>s+(p.total||0),0);
      revenue_chart.push({label:period==='month'?d.getDate().toString():d.toLocaleDateString('en-US',{weekday:'short'}),amount:Math.round(amt*100)/100});
    }
    const closedSessions=sessions.filter(s=>s.status==='closed'&&s.exit&&s.entry);
    const avgDur=closedSessions.length?closedSessions.reduce((s,sess)=>s+(new Date(sess.exit)-new Date(sess.entry))/3600000,0)/closedSessions.length:0;
    const totalRev=payments.reduce((s,p)=>s+(p.total||0),0);
    return{
      total,occupied,vacant:total-occupied,
      occupancy_rate:total?Math.round(occupied/total*1000)/10:0,
      revenue_today:Math.round(revToday*100)/100,revenue_chart,
      total_revenue:Math.round(totalRev*100)/100,
      total_sessions:sessions.length,
      active_sessions:sessions.filter(s=>s.status==='active').length,
      avg_duration:Math.round(avgDur*100)/100,
      violations:getViolations().filter(v=>!v.resolved).length,
      queue_size:getQueue().filter(q=>q.status==='waiting').length
    };
  }

  boot();

  return {
    onReady, _forceReady,
    getUsers,getSlots,getSessions,getReservations,getTransactions,getPayments,
    getViolations,getNotifications,getQueue,getSettings,getLoginHistory,
    saveUsers,saveSlots,saveSessions,saveReservations,saveTransactions,
    savePayments,saveViolations,saveNotifications,saveQueue,saveSettings,saveLoginHistory,
    addNotification,recommendSlot,getAnalytics,genId,shortId,hashPw,
    getCashierLocation,saveCashierLocation
  };
})();

/* ==================================================================
   XQD716 NEXUS 6.0 — Multi-Tenant Cloud Architecture & Real-Time Sync
   ================================================================== */

(function () {
    'use strict';

    const firebaseConfig = {
        apiKey: "AIzaSyAK2yXStkDdOLHpsjhbk10HfVj3O2wvMvE",
        authDomain: "xc-f6b4d.firebaseapp.com",
        projectId: "xc-f6b4d",
        storageBucket: "xc-f6b4d.firebasestorage.app",
        messagingSenderId: "263052117008",
        appId: "1:263052117008:web:f7049b65d8d8009bbe7695",
        measurementId: "G-E0BECTY393"
    };

    // Firebase Core References
    let fbApp = null;
    let fbDb = null;
    let fbAuth = null;
    let fbReady = false;

    // Multi-Tenant Collections
    const COLL_BRANCHES = 'nexus_branches';
    const COLL_TENANT_DATA = 'nexus_tenants_data';
    const COLL_AUDIT_LOGS = 'nexus_audit_logs';

    // Unique Client Session Identity
    const CLIENT_ID = Math.random().toString(36).slice(2, 10);
    const AUTO_SAVE_INTERVAL = 10 * 60 * 1000; // 10 Minutes Loop
    const SESSION_BRANCH_KEY = 'qx716_active_branch';
    const LAST_SAVE_KEY = 'qx716_last_save_ts';

    // Runtime Tenant Context
    let currentTenant = null; // { id, name, username }
    let realtimeUnsubscribe = null;
    let autoSaveTimer = null;
    let debounceSaveTimer = null;
    let lastLocalWriteTs = 0;
    let onCloudUpdateCallback = null;

    // Initialize Firebase Services
    try {
        fbApp = firebase.initializeApp(firebaseConfig);
        fbDb = firebase.firestore();
        fbAuth = firebase.auth();
        fbDb.enablePersistence({ synchronizeTabs: true }).catch(err => {
            console.warn('Firestore offline persistence warning:', err.code);
        });
        try { firebase.analytics(); } catch (e) {}
        fbReady = true;
        console.log('%c🔥 Firebase Multi-Tenant Infrastructure Active', 'color:#00FFFF;font-weight:bold');
    } catch (err) {
        console.error('Firebase initialization error:', err);
        fbReady = false;
    }

    // Update Status Pill in Header
    function setFbStatus(state, text) {
        const el = document.getElementById('fb-status');
        const txt = document.getElementById('fb-status-text');
        if (!el || !txt) return;
        el.classList.remove('online', 'sync', 'offline');
        el.classList.add(state);
        txt.textContent = text;
    }

    // Default Seed Branches
    const DEFAULT_BRANCHES = [
        { id: 'branch_zayouni', name: 'زیوني', username: 'zayouni', password: '716', status: 'active', createdAt: new Date().toISOString() },
        { id: 'branch_mohammed', name: 'محمد', username: 'mohammed', password: '716', status: 'active', createdAt: new Date().toISOString() }
    ];

    // Ensure Default Branches Exist in Cloud
    async function seedDefaultBranchesIfNeeded() {
        if (!fbReady || !fbDb) return;
        try {
            const snap = await fbDb.collection(COLL_BRANCHES).limit(1).get();
            if (snap.empty) {
                console.log('Seeding initial branch tenants...');
                const batch = fbDb.batch();
                DEFAULT_BRANCHES.forEach(b => {
                    const ref = fbDb.collection(COLL_BRANCHES).doc(b.id);
                    batch.set(ref, b);
                });
                await batch.commit();
                await logAuditEvent('SYSTEM', 'Initial default branches seeded (زیوني, محمد)');
            }
        } catch (e) {
            console.warn('Branch seeding check failed:', e);
        }
    }

    // Anonymous Authentication
    async function ensureAuth() {
        if (!fbReady || !fbAuth) return false;
        try {
            if (!fbAuth.currentUser) {
                await fbAuth.signInAnonymously();
            }
            return true;
        } catch (e) {
            console.warn('Anonymous auth failed:', e);
            return false;
        }
    }

    // Audit Logging Engine
    async function logAuditEvent(action, details) {
        if (!fbReady || !fbDb) return;
        try {
            const logEntry = {
                id: 'LOG_' + Date.now().toString(36),
                branchId: currentTenant ? currentTenant.id : 'SYSTEM',
                branchName: currentTenant ? currentTenant.name : 'SYSTEM',
                branchUser: currentTenant ? currentTenant.username : 'SYSTEM',
                action: action,
                details: details,
                clientId: CLIENT_ID,
                timestamp: new Date().toISOString(),
                epoch: Date.now()
            };
            await fbDb.collection(COLL_AUDIT_LOGS).doc(logEntry.id).set(logEntry);
        } catch (e) {
            console.warn('Failed to record audit log:', e);
        }
    }

    // Authentication for Branch Tenants
    async function authenticateBranch(username, password) {
        const cleanUser = String(username || '').trim().toLowerCase();
        const cleanPass = String(password || '').trim();

        if (!cleanUser || !cleanPass) {
            throw new Error('يرجى إدخال اسم المستخدم وكلمة المرور');
        }

        setFbStatus('sync', 'AUTH');

        // Check against Cloud Database
        if (fbReady && fbDb) {
            await ensureAuth();
            const snap = await fbDb.collection(COLL_BRANCHES)
                .where('username', '==', cleanUser)
                .where('password', '==', cleanPass)
                .get();

            if (!snap.empty) {
                const branchDoc = snap.docs[0].data();
                if (branchDoc.status === 'frozen') {
                    setFbStatus('offline', 'FROZEN');
                    throw new Error('هذا الفرع معطل أو مجمد حالياً من قبل الإدارة المركزية.');
                }

                currentTenant = {
                    id: branchDoc.id,
                    name: branchDoc.name,
                    username: branchDoc.username
                };

                localStorage.setItem(SESSION_BRANCH_KEY, JSON.stringify(currentTenant));
                await logAuditEvent('LOGIN', `تسجيل دخول ناجح للفرع: ${branchDoc.name}`);
                setFbStatus('online', 'ONLINE');
                updateBranchUI();
                return currentTenant;
            }
        }

        // Fallback to local default check if cloud is temporarily unreachable
        const fallback = DEFAULT_BRANCHES.find(b => b.username.toLowerCase() === cleanUser && b.password === cleanPass);
        if (fallback) {
            currentTenant = { id: fallback.id, name: fallback.name, username: fallback.username };
            localStorage.setItem(SESSION_BRANCH_KEY, JSON.stringify(currentTenant));
            updateBranchUI();
            setFbStatus('online', 'LOCAL_AUTH');
            return currentTenant;
        }

        setFbStatus('offline', 'AUTH_ERR');
        throw new Error('بيانات الدخول غير صحيحة. تأكد من اسم الفرع وكلمة المرور.');
    }

    // Logout & Switch Tenant
    async function logoutBranch() {
        if (currentTenant) {
            await logAuditEvent('LOGOUT', `تسجيل خروج الفرع: ${currentTenant.name}`);
        }
        if (realtimeUnsubscribe) {
            realtimeUnsubscribe();
            realtimeUnsubscribe = null;
        }
        currentTenant = null;
        localStorage.removeItem(SESSION_BRANCH_KEY);
        updateBranchUI();
        setFbStatus('sync', 'STANDBY');
    }

    // Update Header Pill and Drawer Tenant Names
    function updateBranchUI() {
        const badge = document.getElementById('branch-badge');
        const drawerName = document.getElementById('drawer-branch-name');
        if (currentTenant) {
            if (badge) badge.textContent = `فرع: ${currentTenant.name}`;
            if (drawerName) drawerName.textContent = currentTenant.name;
        } else {
            if (badge) badge.textContent = 'فرع: غير محدد';
            if (drawerName) drawerName.textContent = 'غير مسجل';
        }
    }

    // Get Active Local Storage Key for Isolated Data
    function getTenantStorageKey() {
        const tenantId = currentTenant ? currentTenant.id : 'default';
        return `qx716_nexus_data_${tenantId}`;
    }

    // Load Local Data for Current Tenant
    function loadTenantLocal(defaultFactory) {
        try {
            const raw = localStorage.getItem(getTenantStorageKey());
            if (raw) {
                return JSON.parse(raw);
            }
        } catch (e) {
            console.warn('Error reading tenant localStorage:', e);
        }
        return defaultFactory();
    }

    // Save Data Locally
    function saveTenantLocal(state) {
        try {
            localStorage.setItem(getTenantStorageKey(), JSON.stringify(state));
        } catch (e) {}
    }

    // Real-Time Cloud Synchronization Listener
    function attachTenantSync(onUpdateCallback) {
        onCloudUpdateCallback = onUpdateCallback;
        if (!fbReady || !fbDb || !currentTenant) return;

        if (realtimeUnsubscribe) {
            realtimeUnsubscribe();
        }

        const tenantDocRef = fbDb.collection(COLL_TENANT_DATA).doc(currentTenant.id);

        realtimeUnsubscribe = tenantDocRef.onSnapshot(docSnap => {
            if (!docSnap.exists) return;
            const data = docSnap.data();

            // Ignore self-emitted sync events
            if (data._client === CLIENT_ID) return;
            if ((data._lastWrite || 0) <= lastLocalWriteTs) return;

            console.log('⚡ Realtime remote update received for branch:', currentTenant.name);

            const cleanState = Object.assign({}, data);
            delete cleanState._client;
            delete cleanState._lastWrite;
            delete cleanState._savedAt;
            delete cleanState._savedReason;

            saveTenantLocal(cleanState);

            if (data._savedAt) {
                localStorage.setItem(LAST_SAVE_KEY, String(new Date(data._savedAt).getTime()));
                updateLastSavedDisplay();
            }

            if (typeof onCloudUpdateCallback === 'function') {
                onCloudUpdateCallback(cleanState);
            }

            setFbStatus('online', 'SYNCED');
            setTimeout(() => setFbStatus('online', 'ONLINE'), 1200);
        }, err => {
            console.warn('Realtime sync subscription error:', err);
            setFbStatus('offline', 'SYNC_ERR');
        });
    }

    // Debounced Save (Called upon any internal state modification)
    function debouncedSave(stateGetter) {
        const state = stateGetter();
        saveTenantLocal(state);

        if (!fbReady || !fbDb || !currentTenant) return;
        lastLocalWriteTs = Date.now();
        clearTimeout(debounceSaveTimer);
        setFbStatus('sync', 'SAVING');

        debounceSaveTimer = setTimeout(() => {
            forceSaveCloud(stateGetter(), 'edit');
        }, 900);
    }

    // Immediate Cloud Persistence (No Debounce)
    async function forceSaveCloud(state, reason = 'manual') {
        if (!currentTenant) return false;

        saveTenantLocal(state);
        clearTimeout(debounceSaveTimer);

        if (!fbReady || !fbDb) {
            setFbStatus('offline', 'LOCAL_SAVED');
            return false;
        }

        try {
            setFbStatus('sync', 'SAVING');
            lastLocalWriteTs = Date.now();

            const payload = JSON.parse(JSON.stringify(state));
            payload._lastWrite = lastLocalWriteTs;
            payload._client = CLIENT_ID;
            payload._savedAt = new Date().toISOString();
            payload._savedReason = reason;
            payload._branchId = currentTenant.id;
            payload._branchName = currentTenant.name;

            await fbDb.collection(COLL_TENANT_DATA).doc(currentTenant.id).set(payload);

            localStorage.setItem(LAST_SAVE_KEY, String(Date.now()));
            updateLastSavedDisplay();
            flashSaveIndicator();

            setFbStatus('online', 'SAVED');
            setTimeout(() => setFbStatus('online', 'ONLINE'), 1200);
            return true;
        } catch (e) {
            console.error('Force save cloud error:', e);
            setFbStatus('offline', 'SAVE_FAILED');
            return false;
        }
    }

    // UI Helper: Update Last Saved Timestamp
    function updateLastSavedDisplay() {
        const el = document.getElementById('last-saved-text');
        if (!el) return;
        const ts = Number(localStorage.getItem(LAST_SAVE_KEY) || 0);
        if (!ts) { el.textContent = 'آخر حفظ: —'; return; }
        const d = new Date(ts);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        el.textContent = `آخر حفظ: ${hh}:${mm}:${ss}`;
    }

    function flashSaveIndicator() {
        const el = document.getElementById('save-indicator');
        if (!el) return;
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 1200);
    }

    // Setup 10-Minute Auto-Save Loop
    function startAutoSaveLoop(stateGetter) {
        if (autoSaveTimer) clearInterval(autoSaveTimer);
        autoSaveTimer = setInterval(() => {
            if (currentTenant && fbReady && fbDb) {
                console.log('⏱️ 10-Minute Auto-Save executing for:', currentTenant.name);
                forceSaveCloud(stateGetter(), '10min');
            }
        }, AUTO_SAVE_INTERVAL);
    }

    // Handle Unload & Visibility Background Sync
    function bindSystemSyncListeners(stateGetter) {
        window.addEventListener('beforeunload', () => {
            if (currentTenant) {
                const s = stateGetter();
                saveTenantLocal(s);
                if (fbReady && fbDb) {
                    const payload = JSON.parse(JSON.stringify(s));
                    payload._lastWrite = Date.now();
                    payload._client = CLIENT_ID;
                    payload._savedAt = new Date().toISOString();
                    payload._savedReason = 'beforeunload';
                    fbDb.collection(COLL_TENANT_DATA).doc(currentTenant.id).set(payload).catch(() => {});
                }
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && currentTenant) {
                const s = stateGetter();
                saveTenantLocal(s);
                if (fbReady && fbDb) {
                    const payload = JSON.parse(JSON.stringify(s));
                    payload._lastWrite = Date.now();
                    payload._client = CLIENT_ID;
                    payload._savedAt = new Date().toISOString();
                    payload._savedReason = 'hidden';
                    fbDb.collection(COLL_TENANT_DATA).doc(currentTenant.id).set(payload).catch(() => {});
                }
            }
        });

        window.addEventListener('online', () => {
            setFbStatus('sync', 'ONLINE_SYNC');
            if (currentTenant) {
                forceSaveCloud(stateGetter(), 'reconnected');
            }
        });

        window.addEventListener('offline', () => {
            setFbStatus('offline', 'OFFLINE');
        });
    }

    // ==================== MASTER STEALTH ADMIN METHODS ====================

    async function adminLoadBranches() {
        if (!fbReady || !fbDb) return [];
        try {
            await ensureAuth();
            const snap = await fbDb.collection(COLL_BRANCHES).orderBy('createdAt', 'desc').get();
            return snap.docs.map(d => d.data());
        } catch (e) {
            console.warn('Failed to load branches for admin:', e);
            return DEFAULT_BRANCHES;
        }
    }

    async function adminCreateBranch(name, username, password) {
        if (!name || !username || !password) {
            throw new Error('يرجى ملء جميع حقول الفرع الجديد');
        }
        if (!fbReady || !fbDb) throw new Error('الاتصال السحابي غير متوفر حالياً');

        await ensureAuth();
        const branchId = 'branch_' + Date.now().toString(36);
        const branchData = {
            id: branchId,
            name: name.trim(),
            username: username.trim().toLowerCase(),
            password: password.trim(),
            status: 'active',
            createdAt: new Date().toISOString()
        };

        // Ensure unique username
        const existsCheck = await fbDb.collection(COLL_BRANCHES).where('username', '==', branchData.username).get();
        if (!existsCheck.empty) {
            throw new Error('اسم المستخدم هذا مستخدم بالفعل لفرع آخر');
        }

        await fbDb.collection(COLL_BRANCHES).doc(branchId).set(branchData);
        await logAuditEvent('BRANCH_CREATED', `تم إنشاء فرع جديد: ${name} (${username})`);
        return branchData;
    }

    async function adminToggleBranchStatus(branchId, currentStatus) {
        if (!fbReady || !fbDb) return false;
        const newStatus = currentStatus === 'active' ? 'frozen' : 'active';
        await fbDb.collection(COLL_BRANCHES).doc(branchId).update({ status: newStatus });
        await logAuditEvent('BRANCH_STATUS_CHANGE', `تغيير حالة الفرع ${branchId} إلى: ${newStatus}`);
        return newStatus;
    }

    async function adminLoadAuditLogs() {
        if (!fbReady || !fbDb) return [];
        try {
            await ensureAuth();
            const snap = await fbDb.collection(COLL_AUDIT_LOGS).orderBy('epoch', 'desc').limit(40).get();
            return snap.docs.map(d => d.data());
        } catch (e) {
            console.warn('Failed to load audit logs:', e);
            return [];
        }
    }

    // Export Engine to Global Window
    window.BackendEngine = {
        init: async function () {
            await ensureAuth();
            await seedDefaultBranchesIfNeeded();
            const cached = localStorage.getItem(SESSION_BRANCH_KEY);
            if (cached) {
                try {
                    currentTenant = JSON.parse(cached);
                    updateBranchUI();
                } catch (e) {}
            }
            updateLastSavedDisplay();
        },
        authenticateBranch,
        logoutBranch,
        getCurrentTenant: () => currentTenant,
        loadTenantLocal,
        saveTenantLocal,
        debouncedSave,
        forceSaveCloud,
        attachTenantSync,
        startAutoSaveLoop,
        bindSystemSyncListeners,
        updateLastSavedDisplay,
        flashSaveIndicator,
        setFbStatus,
        logAuditEvent,
        adminLoadBranches,
        adminCreateBranch,
        adminToggleBranchStatus,
        adminLoadAuditLogs
    };

    // Global shortcut for manual save button
    window.manualSave = function (showToast = true) {
        if (window.AppEngine && typeof window.AppEngine.triggerManualSave === 'function') {
            window.AppEngine.triggerManualSave(showToast);
        }
    };
})();

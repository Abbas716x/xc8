/* ==================================================================
   XQD716 NEXUS 6.0 — Enterprise Security Engine & Stealth Controller
   ================================================================== */

(function () {
    'use strict';

    // Master Security Key for Stealth Access
    const MASTER_SECURITY_PASSKEY = 'qx716master';

    // Elements References
    const overlay = document.getElementById('security-breach-overlay');
    const secretTriggerEl = document.getElementById('secret-admin-trigger');

    let breachActive = false;
    let clickCount = 0;
    let clickTimer = null;

    // Trigger Screen Blur & Security Overlay
    function triggerBreach(reason) {
        if (breachActive) return;
        breachActive = true;
        console.warn('🚨 SECURITY BREACH TRIGGERED:', reason);

        if (overlay) {
            overlay.classList.remove('hidden');
        }

        // Log security breach to Cloud Audit Log
        if (window.BackendEngine && typeof window.BackendEngine.logAuditEvent === 'function') {
            window.BackendEngine.logAuditEvent('SECURITY_BREACH_DETECTED', `محاولة وصول غير مصرح بها: ${reason}`);
        }
    }

    // Dismiss Warning Overlay
    function dismissWarning() {
        if (overlay) {
            overlay.classList.add('hidden');
        }
        breachActive = false;
    }

    // Block Context Menu (Right Click)
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        triggerBreach('Right-click / Context Menu Attempt');
        return false;
    }, { capture: true });

    // Block Inspection & DevTools Keyboard Shortcuts
    document.addEventListener('keydown', function (e) {
        const isCtrlOrCmd = e.ctrlKey || e.metaKey;
        const key = e.key ? e.key.toUpperCase() : '';
        const keyCode = e.keyCode || e.which;

        // F12 Key
        if (keyCode === 123 || key === 'F12') {
            e.preventDefault();
            e.stopPropagation();
            triggerBreach('F12 DevTools Attempt');
            return false;
        }

        // Ctrl + Shift + I (Inspect)
        // Ctrl + Shift + J (Console)
        // Ctrl + Shift + C (Element Selector)
        if (isCtrlOrCmd && e.shiftKey && (key === 'I' || key === 'J' || key === 'C' || keyCode === 73 || keyCode === 74 || keyCode === 67)) {
            e.preventDefault();
            e.stopPropagation();
            triggerBreach('Ctrl+Shift+I/J/C DevTools Attempt');
            return false;
        }

        // Ctrl + U (View Page Source)
        if (isCtrlOrCmd && (key === 'U' || keyCode === 85)) {
            e.preventDefault();
            e.stopPropagation();
            triggerBreach('Ctrl+U View Source Attempt');
            return false;
        }

        // Ctrl + S (Save Webpage)
        if (isCtrlOrCmd && (key === 'S' || keyCode === 83)) {
            e.preventDefault();
            e.stopPropagation();
            triggerBreach('Ctrl+S Save Page Attempt');
            return false;
        }
    }, { capture: true });

    // Detect DevTools Opening via Window Dimension Thresholds
    function checkDevToolsDimensions() {
        const threshold = 170;
        const widthDiff = window.outerWidth - window.innerWidth > threshold;
        const heightDiff = window.outerHeight - window.innerHeight > threshold;

        if (widthDiff || heightDiff) {
            triggerBreach('DevTools Dimension Expansion');
        }
    }

    window.addEventListener('resize', checkDevToolsDimensions);

    // ==================== STEALTH MASTER ADMIN TRIGGER ====================
    // 5 Fast Clicks within 2.5 seconds on the Logo

    if (secretTriggerEl) {
        secretTriggerEl.addEventListener('click', function () {
            clickCount++;
            clearTimeout(clickTimer);

            if (clickCount >= 5) {
                clickCount = 0;
                promptMasterAdminAuth();
            } else {
                clickTimer = setTimeout(() => {
                    clickCount = 0;
                }, 2500);
            }
        });
    }

    // Master Admin Passkey Authentication Dialog
    async function promptMasterAdminAuth() {
        if (!window.DialogEngine || typeof window.DialogEngine.prompt !== 'function') {
            const pass = prompt('🔐 MASTER ADMIN PASSKEY:');
            if (pass === MASTER_SECURITY_PASSKEY) {
                openMasterAdminPanel();
            } else if (pass !== null) {
                alert('رمز الحماية غير صحيح!');
            }
            return;
        }

        const inputKey = await window.DialogEngine.prompt(
            'أدخل رمز الحماية المركزي لفتح لوحة المدير العام (Stealth Admin):',
            'التحقق الأمني للمدير العام'
        );

        if (inputKey === MASTER_SECURITY_PASSKEY) {
            openMasterAdminPanel();
        } else if (inputKey !== null) {
            window.DialogEngine.alert('رمز الحماية غير صحيح! تم رفض الوصول.', 'خطأ أمني');
            if (window.BackendEngine && typeof window.BackendEngine.logAuditEvent === 'function') {
                window.BackendEngine.logAuditEvent('FAILED_ADMIN_LOGIN', 'محاولة فاشلة لدخول لوحة المدير العام');
            }
        }
    }

    // Open & Populate Master Admin Panel
    async function openMasterAdminPanel() {
        const modal = document.getElementById('modal-stealth-admin');
        if (!modal) return;

        modal.style.display = 'flex';
        await renderAdminBranches();
        await renderAdminAuditLogs();
    }

    // Render Branches in Master Admin Modal
    async function renderAdminBranches() {
        const container = document.getElementById('admin-branches-list');
        if (!container || !window.BackendEngine) return;

        container.innerHTML = `<div class="text-xs text-gray-400 text-center py-4">جاري تحميل الفروع السحابية...</div>`;

        try {
            const branches = await window.BackendEngine.adminLoadBranches();
            if (branches.length === 0) {
                container.innerHTML = `<div class="text-xs text-gray-500 text-center py-4">لا توجد فروع مسجلة</div>`;
                return;
            }

            container.innerHTML = branches.map(b => {
                const isFrozen = b.status === 'frozen';
                return `
                    <div class="glass p-3 flex items-center justify-between gap-3 text-xs font-tajawal">
                        <div>
                            <div class="font-bold text-white flex items-center gap-2">
                                <span>${escapeHtml(b.name)}</span>
                                <span class="badge ${isFrozen ? 'badge-expired' : 'badge-live'} text-[9px]">
                                    ${isFrozen ? 'مجمد' : 'نشط'}
                                </span>
                            </div>
                            <div class="text-[10px] text-cyan-400 font-mono mt-0.5">user: ${escapeHtml(b.username)}</div>
                        </div>
                        <button class="btn btn-ghost py-1 px-3 text-[10px] ${isFrozen ? 'text-emerald-400 border-emerald-500/40' : 'text-pink-500 border-pink-500/40'}"
                                onclick="window.SecurityEngine.toggleBranchFreeze('${b.id}', '${b.status}')">
                            ${isFrozen ? 'إلغاء التجميد' : 'تجميد الفرع'}
                        </button>
                    </div>
                `;
            }).join('');
        } catch (e) {
            container.innerHTML = `<div class="text-xs text-red-400 text-center py-2">تعذر جلب الفروع</div>`;
        }
    }

    // Render Audit Logs in Master Admin Modal
    async function renderAdminAuditLogs() {
        const container = document.getElementById('admin-audit-logs');
        if (!container || !window.BackendEngine) return;

        container.innerHTML = `<div class="text-[10px] text-gray-400 text-center py-3">جاري تحميل سجل المراقبة...</div>`;

        try {
            const logs = await window.BackendEngine.adminLoadAuditLogs();
            if (logs.length === 0) {
                container.innerHTML = `<div class="text-[10px] text-gray-500 text-center py-3">لا توجد سجلات بعد</div>`;
                return;
            }

            container.innerHTML = logs.map(l => {
                const time = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('en-GB') : '--:--:--';
                const date = l.timestamp ? new Date(l.timestamp).toISOString().slice(0, 10) : '';
                return `
                    <div class="p-2 rounded bg-black/40 border border-white/5 flex items-start justify-between gap-2">
                        <div>
                            <span class="text-cyan-400 font-bold">[${l.action}]</span>
                            <span class="text-gray-300 ml-1 font-tajawal">${escapeHtml(l.details || '')}</span>
                            <span class="text-fuchsia-400 block text-[9px]">بواسطة: ${escapeHtml(l.branchName || 'النظام')} (${escapeHtml(l.branchUser || '-')})</span>
                        </div>
                        <div class="text-right text-[9px] text-gray-500 whitespace-nowrap">
                            <div>${time}</div>
                            <div>${date}</div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            container.innerHTML = `<div class="text-[10px] text-red-400 text-center py-2">تعذر جلب سجلات المراقبة</div>`;
        }
    }

    // Create New Branch Handler from Admin Modal
    async function handleAdminCreateBranch() {
        const nameEl = document.getElementById('admin-new-branch-name');
        const userEl = document.getElementById('admin-new-branch-user');
        const passEl = document.getElementById('admin-new-branch-pass');

        const name = nameEl.value.trim();
        const user = userEl.value.trim();
        const pass = passEl.value.trim();

        if (!name || !user || !pass) {
            if (window.DialogEngine) window.DialogEngine.alert('يرجى ملء جميع بيانات الفرع الجديد', 'تنبيه');
            return;
        }

        try {
            await window.BackendEngine.adminCreateBranch(name, user, pass);
            nameEl.value = '';
            userEl.value = '';
            passEl.value = '';
            if (window.DialogEngine) window.DialogEngine.alert(`تم إنشاء الفرع بنجاح:\nالاسم: ${name}\nالمستخدم: ${user}`, 'نجاح العملية');
            await renderAdminBranches();
            await renderAdminAuditLogs();
        } catch (err) {
            if (window.DialogEngine) window.DialogEngine.alert(err.message, 'خطأ في الإنشاء');
        }
    }

    // Toggle Freeze on Branch
    async function toggleBranchFreeze(branchId, currentStatus) {
        if (!window.BackendEngine) return;
        try {
            await window.BackendEngine.adminToggleBranchStatus(branchId, currentStatus);
            await renderAdminBranches();
            await renderAdminAuditLogs();
        } catch (e) {
            console.error('Failed to toggle branch status:', e);
        }
    }

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[m]);
    }

    // Expose Security Engine to Global Scope
    window.SecurityEngine = {
        dismissWarning,
        openMasterAdminPanel,
        renderAdminBranches,
        renderAdminAuditLogs,
        handleAdminCreateBranch,
        toggleBranchFreeze
    };

    // Global hook for button onclick inside admin modal
    if (window.BackendEngine) {
        window.BackendEngine.adminCreateBranchHandler = handleAdminCreateBranch;
    }
})();

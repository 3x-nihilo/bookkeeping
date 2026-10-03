/* Atomic local snapshots plus an IndexedDB recovery copy. No expiry or cloud sync. */
'use strict';
(async () => {
    const KEY = 'neurofinance.snapshot.v1';
    const fixed = new Set(['books','current_book','custom_expense_cats','custom_income_cats','budgets','total_budget','shortcuts','recurringTxs','lang','amount_hidden','avatar','profile_name','cat_memory','gemini_api_key','level_data','achievements','pro_config','pro_keys','pro_ai_enabled']);
    const owned = k => fixed.has(k) || /^(txs_|budgets_|total_budget_|recurring_)/.test(k) || /^.+_\d{4}(_(?:w?\d+)|-\d{2}-\d{2})$/.test(k);
    const gate = document.getElementById('storage-gate');
    let db, state, lastRaw, queue = Promise.resolve(), mirrorFailed = false, persistent = false;
    function validate(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('数据格式不正确');
        for (const [k, v] of Object.entries(data)) {
            if (!owned(k) || typeof v !== 'string') throw Error('包含不支持的数据字段');
            if (/^txs_/.test(k)) {
                const rows = JSON.parse(v);
                if (!Array.isArray(rows) || rows.some(t => !t || !((typeof t.id === 'number' && Number.isFinite(t.id)) || (typeof t.id === 'string' && t.id.trim().length > 0)) || !Number.isFinite(t.amount) || t.amount <= 0 || !['income','expense'].includes(t.type) || typeof t.desc !== 'string' || typeof t.cat !== 'string' || !Number.isFinite(Date.parse(t.date)))) throw Error('账单数据格式不正确');
                if (new Set(rows.map(t => String(t.id))).size !== rows.length) throw Error('账单编号重复');
            } else if (k === 'books') {
                const rows = JSON.parse(v);
                if (!Array.isArray(rows) || !rows.length || rows.some(b => !b || typeof b.id !== 'string' || !/^[\w-]+$/.test(b.id) || typeof b.name !== 'string' || typeof b.icon !== 'string' || typeof b.color !== 'string') || new Set(rows.map(b=>b.id)).size !== rows.length) throw Error('账本数据格式不正确');
            } else if (k === 'recurringTxs') {
                if (!Array.isArray(JSON.parse(v))) throw Error('重复记账格式不正确');
            } else if (/^(budgets(?:_|$)|custom_(expense|income)_cats$|shortcuts$|cat_memory$)/.test(k)) {
                const obj = JSON.parse(v);
                if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw Error('设置格式不正确');
            } else if (/^total_budget/.test(k) && !Number.isFinite(Number(v))) throw Error('预算格式不正确');
        }
    }
    function decode(raw) {
        const s = JSON.parse(raw);
        if (s.version !== 1 || !Number.isSafeInteger(s.revision) || s.revision < 0) throw Error('数据版本不正确');
        validate(s.data); return s;
    }
    function status() {
        const el = document.getElementById('storage-status');
        if (el) el.textContent = (persistent ? '已启用本机持久存储。' : '浏览器尚未授予持久存储保护。') + (db && !mirrorFailed ? '本机双副本保存。' : '本机恢复副本不可用，请导出备份。') + '请定期备份到手机文件。';
    }
    function mirror(snapshot) {
        if (!db) return Promise.resolve();
        queue = queue.then(() => new Promise((resolve, reject) => {
            const tx = db.transaction('snapshots', 'readwrite');
            const store = tx.objectStore('snapshots');
            const req = store.get('latest');
            req.onsuccess = () => { if (!req.result || req.result.revision < snapshot.revision) store.put(snapshot, 'latest'); };
            tx.oncomplete = resolve;
            tx.onerror = tx.onabort = () => reject(tx.error || Error('副本写入失败'));
        })).then(() => { mirrorFailed = false; status(); }).catch(() => { mirrorFailed = true; status(); });
        return queue;
    }
    function block(message) { gate.textContent = message; gate.style.display = 'grid'; }
    function commit(data) {
        if (localStorage.getItem(KEY) !== lastRaw) {
            block('另一个窗口已更新账本。请重新打开页面后继续，避免覆盖新记录。');
            throw Error('账本已在其他窗口更新');
        }
        if (JSON.stringify(data) === JSON.stringify(state.data)) return;
        const next = {version:1, revision:state.revision + 1, data};
        const raw = JSON.stringify(next);
        try { localStorage.setItem(KEY, raw); }
        catch (error) {
            block('保存失败，本次修改尚未保存。请先备份已保存的数据，释放空间后重新打开。');
            const button = document.createElement('button');
            button.textContent = '备份已保存的数据'; button.onclick = () => window.nfStorage.exportBackup();
            gate.append(button); throw error;
        }
        state = next; lastRaw = raw; mirror(next);
    }
    async function requestPersistence() {
        try { persistent = !!(navigator.storage && (await navigator.storage.persisted() || await navigator.storage.persist())); }
        catch { persistent = false; }
        status();
    }
    try {
        try {
            db = await new Promise((resolve, reject) => {
                const req = indexedDB.open('neurofinance-durable', 1);
                let expired = false;
                const timeout = setTimeout(() => { expired = true; reject(Error('数据库超时')); }, 8000);
                req.onupgradeneeded = () => req.result.createObjectStore('snapshots');
                req.onsuccess = () => { clearTimeout(timeout); if (expired) req.result.close(); else resolve(req.result); };
                req.onerror = req.onblocked = () => { clearTimeout(timeout); expired = true; reject(req.error || Error('数据库被占用')); };
            });
        } catch { db = null; }
        lastRaw = localStorage.getItem(KEY);
        if (lastRaw !== null) state = decode(lastRaw);
        else {
            const backup = db && await new Promise((resolve, reject) => {
                const tx = db.transaction('snapshots', 'readonly');
                const req = tx.objectStore('snapshots').get('latest');
                req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
            });
            if (backup) state = decode(JSON.stringify(backup));
            else {
                const data = {};
                for (let i=0; i<localStorage.length; i++) {
                    const k = localStorage.key(i); if (owned(k)) data[k] = localStorage.getItem(k);
                }
                if (!data.txs_default && localStorage.getItem('txs')) data.txs_default = localStorage.getItem('txs');
                validate(data); state = {version:1, revision:1, data};
            }
            lastRaw = JSON.stringify(state); localStorage.setItem(KEY, lastRaw);
        }
        await mirror(state);
        window.nfStorage = {
            getItem: k => state.data[k] ?? null,
            setItem: (k,v) => { if (!owned(k)) throw Error('未知存储字段：'+k); commit({...state.data,[k]:String(v)}); },
            removeItem: k => { const next = {...state.data}; delete next[k]; commit(next); },
            requestPersistence,
            flush: () => queue,
            exportBackup() {
                const data = {...state.data}; for (const key of ['gemini_api_key','pro_config','pro_keys','pro_ai_enabled']) delete data[key];
                const backup = {app:'NeuroFinance',version:1,createdAt:new Date().toISOString(),data};
                const url = URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
                const a = document.createElement('a'); a.href=url; a.download='NeuroFinance-全部账本-'+new Date().toISOString().slice(0,10)+'.json';
                document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),60000);
            },
            async importBackup(file) {
                if (!file) return;
                try {
                    if (file.size > 20*1024*1024) throw Error('备份文件过大');
                    const backup = JSON.parse(await file.text());
                    if (backup.app !== 'NeuroFinance' || backup.version !== 1) throw Error('请选择本软件导出的完整备份');
                    validate(backup.data);
                    if (!Object.keys(backup.data).length) throw Error('备份文件为空');
                    if (!confirm('恢复将替换本机所有账本和设置。建议先备份当前账本。确定恢复此备份吗？')) return;
                    const data = {...backup.data}; for (const key of ['gemini_api_key','pro_config','pro_keys','pro_ai_enabled']) delete data[key];
                    for (const key of ['gemini_api_key','pro_config','pro_keys','pro_ai_enabled']) if (state.data[key]) data[key] = state.data[key];
                    commit(data); await queue; location.reload();
                } catch (error) { alert('无法恢复：'+error.message); }
            }
        };
        addEventListener('storage', e => {
            if ((e.key === KEY || e.key === null) && localStorage.getItem(KEY) !== lastRaw) block('账本已在其他窗口更新或本机数据已被清理，请重新打开页面后继续。');
        });
        const script = document.createElement('script'); script.src='./app.js';
        script.onload = () => {
            try { initializeApp(); gate.style.display='none'; requestPersistence(); }
            catch (error) { block('账本未能完整加载，请刷新重试。现有数据已保留。错误：'+error.message); }
            finally { window.nfBootComplete = true; }
        };
        script.onerror = () => { block('应用未能加载，请联网后刷新重试。'); window.nfBootComplete = true; };
        document.body.append(script);
    } catch (error) {
        window.nfBootComplete = true;
        block('无法安全读取账本，已停止写入以保护现有记录。请勿清理浏览器数据。错误：'+error.message);
        const exportButton = document.createElement('button');
        exportButton.textContent = '导出原始数据以便恢复';
        exportButton.style.cssText = 'margin-top:24px;padding:14px 20px;border:1px solid #666;border-radius:16px;font-size:15px';
        exportButton.onclick = () => {
            const keys = Object.keys(localStorage).filter(key => key === KEY || key === 'txs' || owned(key));
            const data = Object.fromEntries(keys.map(key => [key,localStorage.getItem(key)]));
            // Emergency archive can contain original API settings. Keep it private.
            const url = URL.createObjectURL(new Blob([JSON.stringify({app:'NeuroFinance-raw-recovery',data},null,2)],{type:'application/json'}));
            const a = document.createElement('a'); a.href=url; a.download='NeuroFinance-原始数据-请勿公开.json';
            document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),60000);
        };
        gate.append(exportButton);
        const updateLink = document.createElement('a'); updateLink.href='./recover.html';
        updateLink.textContent='更新应用代码（保留账本）'; updateLink.style.cssText='margin-top:16px;font-size:15px;color:#c4b5fd'; gate.append(updateLink);
    }
})();

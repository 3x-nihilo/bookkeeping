/* Foreground PWA updates. Never deletes or rewrites ledger storage. */
(() => {
    if (!('serviceWorker' in navigator)) return;
    const sw = navigator.serviceWorker;
    let registration, checking = false, changed = false, reloading = false;
    let lastInteraction = Date.now(), lastCheck = 0, requestedWorker = null;
    let previousController = sw.controller;
    const visible = el => !!el && el.getClientRects().length > 0;
    function safe() {
        if (document.visibilityState !== 'visible' || !window.nfBootComplete || Date.now() - lastInteraction < 2000) return false;
        if (document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')) return false;
        if ([...document.querySelectorAll('[id$="-modal"],[role="dialog"]')].some(visible)) return false;
        if (document.getElementById('chat-input')?.value.trim()) return false;
        try { return !window.nfUpdateBusy?.(); } catch { return false; }
    }
    async function apply() {
        if (reloading || !safe()) return;
        if (changed) {
            reloading = true;
            try {
                await window.nfStorage?.flush?.();
                // A new edit may have started while the recovery copy was saving.
                if (!safe()) { reloading = false; return; }
                location.reload();
            } catch { reloading = false; }
        } else if (registration?.waiting && requestedWorker !== registration.waiting) {
            requestedWorker = registration.waiting;
            requestedWorker.postMessage({type:'NF_ACTIVATE_UPDATE'});
            // Retry if a browser discarded a message during suspension.
            setTimeout(() => { requestedWorker = null; }, 10000);
        }
    }
    sw.addEventListener('controllerchange', () => {
        // clients.claim on the first installation does not require a reload.
        if (previousController || requestedWorker) changed = true;
        previousController = sw.controller;
        apply();
    });
    async function check() {
        if (!registration || checking || document.visibilityState !== 'visible' || navigator.onLine === false) return;
        apply();
        if (Date.now() - lastCheck < 15000) return;
        checking = true; lastCheck = Date.now();
        try { await registration.update(); } catch { /* Offline: keep using the installed version. */ }
        finally { checking = false; apply(); }
    }
    sw.register('./sw.js', {updateViaCache:'none'}).then(reg => {
        registration = reg;
        function watch() {
            const worker = reg.installing;
            worker?.addEventListener('statechange', () => { if (worker.state === 'installed') apply(); });
        }
        reg.addEventListener('updatefound', watch);
        watch(); check();
    }).catch(() => {});
    for (const name of ['pointerdown','keydown','input']) document.addEventListener(name, () => { lastInteraction = Date.now(); }, {capture:true,passive:true});
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pageshow', check);
    window.addEventListener('online', check);
    setInterval(check, 60000);
    setInterval(apply, 1000);
})();

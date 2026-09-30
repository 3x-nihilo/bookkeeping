
        // --- Data State ---
        const SYSTEM_EXPENSE_KEYS = ['food', 'transport', 'tech', 'utilities', 'entertainment', 'other', 'shopping'];
        const SYSTEM_INCOME_KEYS = ['salary', 'bonus', 'investment', 'other_in'];

        const DEFAULT_EXPENSE_CATS = {
            food: { label: '餐饮', color: '#8b5cf6', icon: 'coffee' },
            transport: { label: '交通', color: '#3b82f6', icon: 'car' },
            shopping: { label: '购物', color: '#10b981', icon: 'shopping-bag' },
            tech: { label: '游戏', color: '#f97316', icon: 'gamepad-2' },
            utilities: { label: '生活', color: '#06b6d4', icon: 'home' },
            entertainment: { label: '娱乐', color: '#ec4899', icon: 'film' },
            other: { label: '其他', color: '#64748b', icon: 'package' }
        };
        const DEFAULT_INCOME_CATS = {
            salary: { label: '工资', color: '#0891b2', icon: 'banknote' },
            bonus: { label: '奖金', color: '#7c3aed', icon: 'gift' },
            investment: { label: '理财', color: '#2563eb', icon: 'trending-up' },
            other_in: { label: '其他', color: '#059669', icon: 'wallet' }
        };
        let EXPENSE_CATS = {...DEFAULT_EXPENSE_CATS, ...JSON.parse(nfStorage.getItem('custom_expense_cats') || '{}')};
        let INCOME_CATS = {...DEFAULT_INCOME_CATS, ...JSON.parse(nfStorage.getItem('custom_income_cats') || '{}')};

        const PRESET_COLORS = ['#8b5cf6', '#06b6d4', '#f97316', '#10b981', '#ec4899', '#3b82f6', '#14b8a6', '#ef4444', '#f59e0b', '#6366f1'];

        const DEFAULT_BOOKS = [
            { id: 'default', name: '日常', icon: 'wallet', color: '#7c3aed' },
            { id: 'travel', name: '旅游', icon: 'plane', color: '#06b6d4' },
            { id: 'family', name: '家庭', icon: 'home', color: '#10b981' },
            { id: 'business', name: '生意', icon: 'briefcase', color: '#f59e0b' },
            { id: 'reimburse', name: '报销', icon: 'receipt', color: '#ef4444' },
            { id: 'company', name: '公司', icon: 'building', color: '#6366f1' },
            { id: 'team', name: '团队', icon: 'users', color: '#ec4899' }
        ];
        let books = JSON.parse(nfStorage.getItem('books') || JSON.stringify(DEFAULT_BOOKS));
        let currentBook = nfStorage.getItem('current_book') || 'default';

        function getTxKey() { return `txs_${currentBook}`; }
        let txs = JSON.parse(nfStorage.getItem(getTxKey()) || '[]');
        function saveTxs() { nfStorage.setItem(getTxKey(), JSON.stringify(txs)); }
        function switchBook(bookId) {
            saveTxs();
            currentBook = bookId;
            nfStorage.setItem('current_book', bookId);
            txs = JSON.parse(nfStorage.getItem(getTxKey()) || '[]');
            budgets = JSON.parse(nfStorage.getItem(getBudgetKey()) || '{}');
            totalBudget = parseFloat(nfStorage.getItem(getTotalBudgetKey()) || '0');
            renderAll();
            renderBookSelector();
            showToast(`${t('toast_switched_to')}「${books.find(b=>b.id===bookId)?.name||''}」`);
        }
        
        let currentStatsFilter = 'month';
        let customStatsRange = { start: null, end: null };
        let chartDisplayType = 'expense';
        let amountHidden = nfStorage.getItem('amount_hidden') === 'true';
        let currentManageType = 'expense';
        let trendChart = null;
        let pieChart = null;
        let currentPieType = 'expense';
        
        // --- NEW: Date Filter Logic ---
        // 'month', 'year', 'day', 'range'
        let dateFilterState = {
            mode: 'month',
            value: `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`,
            start: null,
            end: null
        };
        let showAllHistory = true;
        let listFilterType = 'all';
        let listFilterCat = 'all';
        let listRenderCount = 50;
        let tempFilterCats = [];

        let recognition = null;
        let isListening = false;

        // === AI State ===
        let lastAiTxId = null;
        let undoStack = []; // {action, data} for undo
        let pendingAction = null; // {type, payload, message} awaiting confirmation
        let multiTurnState = null; // {step, partial} for multi-turn dialogue
        let chatHistory = []; // last 5 messages for context
        let catMemory = JSON.parse(nfStorage.getItem('cat_memory') || '{}');
        function getBudgetKey() { return `budgets_${currentBook}`; }
        function getTotalBudgetKey() { return `total_budget_${currentBook}`; }
        let budgets = JSON.parse(nfStorage.getItem(getBudgetKey()) || (currentBook === 'default' ? nfStorage.getItem('budgets') : null) || '{}');
        let totalBudget = parseFloat(nfStorage.getItem(getTotalBudgetKey()) || (currentBook === 'default' ? nfStorage.getItem('total_budget') : null) || '0');
        if (budgets.total && totalBudget <= 0) { totalBudget = budgets.total; nfStorage.setItem(getTotalBudgetKey(), totalBudget); }
        if (budgets.total) { delete budgets.total; nfStorage.setItem(getBudgetKey(), JSON.stringify(budgets)); }
        let shortcuts = JSON.parse(nfStorage.getItem('shortcuts') || '{}'); // {keyword: {amount, cat, type, desc}}
        let recurringTxs = JSON.parse(nfStorage.getItem('recurringTxs') || '[]');

        // === Level System ===
        const LEVELS = [
            { title: '金币散落者', desc: '口袋有洞但不自知', minDays: 0, minTx: 0, budgetHits: 0 },
            { title: '账本见习生', desc: '第一次打开了记录', minDays: 0, minTx: 5, budgetHits: 0 },
            { title: '支出侦探', desc: '跟踪每一笔去向', minDays: 3, minTx: 15, budgetHits: 0 },
            { title: '小数点猎人', desc: '连零头都不放过', minDays: 5, minTx: 25, budgetHits: 0 },
            { title: '预算学徒', desc: '给欲望画了条线', minDays: 7, minTx: 35, budgetHits: 1 },
            { title: '存钱罐守卫', desc: '月底终于有余额了', minDays: 10, minTx: 50, budgetHits: 1 },
            { title: '周期观测员', desc: '发现了月中综合症', minDays: 14, minTx: 70, budgetHits: 1 },
            { title: '消费断舍离', desc: '删掉了三个购物App', minDays: 18, minTx: 90, budgetHits: 2 },
            { title: '记账连击王', desc: '手速已超过花钱速度', minDays: 21, minTx: 110, budgetHits: 2 },
            { title: '预算驯兽师', desc: '欲望被你套上了缰', minDays: 25, minTx: 140, budgetHits: 2 },
            { title: '副本通关者', desc: '第一次月度达标', minDays: 30, minTx: 170, budgetHits: 3 },
            { title: '数字感知师', desc: '看一眼就知道贵不贵', minDays: 35, minTx: 200, budgetHits: 3 },
            { title: '冲动克制者', desc: '购物车清空改收藏', minDays: 40, minTx: 240, budgetHits: 3 },
            { title: '财务结界术士', desc: '不该花的钱进不来', minDays: 50, minTx: 280, budgetHits: 4 },
            { title: '资产锻造匠', desc: '每一分都有去处', minDays: 60, minTx: 330, budgetHits: 4 },
            { title: '复利领悟者', desc: '开始理解时间的价格', minDays: 75, minTx: 400, budgetHits: 5 },
            { title: '被动收入猎手', desc: '睡觉时钱也在动', minDays: 90, minTx: 480, budgetHits: 5 },
            { title: '消费禅修者', desc: '花与不花皆自在', minDays: 120, minTx: 580, budgetHits: 6 },
            { title: '财务自由行者', desc: '钱为你工作', minDays: 150, minTx: 700, budgetHits: 7 },
            { title: '金融觉醒者', desc: '财富只是副产品', minDays: 180, minTx: 850, budgetHits: 8 },
            { title: '经济永动机', desc: '系统已自行运转', minDays: 365, minTx: 1000, budgetHits: 10 },
        ];
        function lvlTitle(i) { const names = t('level_names'); return (names && names[i]) || LEVELS[i].title; }
        function lvlDesc(i) { const descs = t('level_descs'); return (descs && descs[i]) || LEVELS[i].desc; }
        function achTitle(id) { const names = t('ach_names'); return (names && names[id]) || ACHIEVEMENTS.find(a=>a.id===id)?.title || id; }
        function achDesc(id) { const descs = t('ach_descs'); return (descs && descs[id]) || ACHIEVEMENTS.find(a=>a.id===id)?.desc || ''; }
        function getComebackMsgs() {
            return t('comeback_msgs') || ['欢迎回来。你的钱没等你，但我等了','失踪人口回归！这几天花的钱，它们不会自己记的你知道吧','回来就好。你不在的时候，余额哭了好几次'];
        }

        function getLevelData() {
            const data = JSON.parse(nfStorage.getItem('level_data') || 'null') || {
                streak: 0, maxStreak: 0, totalTx: 0, budgetHits: 0, lastActiveDate: null, level: 0, xp: 0
            };
            return data;
        }
        function saveLevelData(d) { nfStorage.setItem('level_data', JSON.stringify(d)); }

        function getLocalDate(offset = 0) {
            const d = new Date(Date.now() + offset);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        }
        function checkStreak() {
            const d = getLevelData();
            const today = getLocalDate();
            // 基于交易记录算streak：从今天往前数连续有记账的天数
            const txDates = new Set(txs.map(t => {
                const dt = new Date(t.date);
                return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
            }));
            let streak = 0;
            for (let i = 0; i < 365; i++) {
                const day = getLocalDate(-i * 86400000);
                if (txDates.has(day)) {
                    streak++;
                } else if (i === 0) {
                    continue; // 今天还没记也没关系，从昨天开始算
                } else {
                    break;
                }
            }
            if (streak === 0 && txDates.has(today)) streak = 1;
            const prevStreak = d.streak;
            d.streak = streak;
            if (d.streak > d.maxStreak) d.maxStreak = d.streak;
            // 断签回来检测
            if (d.lastActiveDate && d.lastActiveDate !== today) {
                const gap = Math.floor((Date.now() - new Date(d.lastActiveDate).getTime()) / 86400000);
                if (gap >= 7 && d.level > 0) { d.level = Math.max(0, d.level - 1); }
                if (gap >= 3 && prevStreak > 0) { d._comeback = true; }
            }
            d.lastActiveDate = today;
            saveLevelData(d);
            return d;
        }

        function addLevelXP(action) {
            const d = getLevelData();
            const xpMap = { record: 10, voice: 15, streak_bonus: 5, budget_hit: 100 };
            d.xp += xpMap[action] || 0;
            if (action === 'record') d.totalTx++;
            if (action === 'budget_hit') d.budgetHits++;
            // Check level up
            let newLevel = d.level;
            for (let i = LEVELS.length - 1; i >= 0; i--) {
                const req = LEVELS[i];
                if (d.maxStreak >= req.minDays && d.totalTx >= req.minTx && d.budgetHits >= req.budgetHits) {
                    newLevel = i; break;
                }
            }
            const leveledUp = newLevel > d.level;
            d.level = newLevel;
            saveLevelData(d);
            return { leveledUp, level: newLevel, title: lvlTitle(newLevel) };
        }

        function renderLevelBadge() {
            const d = getLevelData();
            const el = document.getElementById('greeting-text');
            if (!el) return;
            const lvl = LEVELS[d.level] || LEVELS[0];
            const h = new Date().getHours();
            const key = h < 12 ? 'greeting_morning' : h < 18 ? 'greeting_afternoon' : 'greeting_evening';
            el.textContent = `${t(key)} · ${lvlTitle(d.level)}`;
        }

        // === Hidden Achievements ===
        const ACHIEVEMENTS = [
            { id: 'triple', icon: '✦', title: '七连击', desc: '累计记账7笔', check: (ctx) => ctx.action === 'record' && txs.length >= 7 },
            { id: 'streak3', icon: '✦', title: '三日之约', desc: '连续记账3天', check: (ctx) => { if (ctx.action !== 'record') return false; const d = getLevelData(); return d.streak >= 3; }},
            { id: 'budget_set', icon: '✦', title: '画线大师', desc: '第一次设置了预算', check: (ctx) => ctx.action === 'budget_set' },
            { id: 'ten_records', icon: '✦', title: '初具规模', desc: '累计记账10笔', check: (ctx) => ctx.action === 'record' && txs.length >= 10 },
            { id: 'night_owl', icon: '✦', title: '凌晨经济学家', desc: '凌晨2-5点记了一笔账', check: (ctx) => { const h = new Date().getHours(); return ctx.action === 'record' && h >= 2 && h < 5; }},
            { id: 'big_day', icon: '✦', title: '日入斗金', desc: '单笔收入超过10,000', check: (ctx) => ctx.action === 'record' && ctx.type === 'income' && ctx.amount >= 10000 },
            { id: 'zero_spend', icon: '✦', title: '断舍离', desc: '连续7天零支出', check: (ctx) => { if (ctx.action !== 'daily_check') return false; const now = new Date(); for (let i = 0; i < 7; i++) { const d = new Date(now); d.setDate(d.getDate()-i); const ds = d.toISOString().slice(0,10); if (txs.some(t => t.type==='expense' && t.date.slice(0,10)===ds)) return false; } return true; }},
            { id: 'all_round', icon: '✦', title: '精确制导', desc: '月预算使用率在95%-105%之间', check: (ctx) => { if (ctx.action !== 'month_end' || totalBudget <= 0) return false; const now = new Date(); const ms = new Date(now.getFullYear(),now.getMonth(),1); const spent = txs.filter(t=>t.type==='expense'&&new Date(t.date)>=ms).reduce((s,t)=>s+t.amount,0); const pct = spent/totalBudget*100; return pct >= 95 && pct <= 105; }},
            { id: 'round_lover', icon: '✦', title: '强迫症确诊', desc: '连续20笔金额全是整数', check: (ctx) => { if (ctx.action !== 'record') return false; const recent = txs.slice(-20); return recent.length >= 20 && recent.every(t => t.amount === Math.floor(t.amount)); }},
            { id: 'early_bird', icon: '✦', title: '时间管理大师', desc: '连续7天在同一小时内记账', check: (ctx) => { if (ctx.action !== 'record') return false; const days = {}; txs.forEach(t => { const d = t.date.slice(0,10); if (!days[d]) days[d] = new Date(t.date).getHours(); }); const keys = Object.keys(days).sort().slice(-7); if (keys.length < 7) return false; const h0 = days[keys[0]]; return keys.every(k => Math.abs(days[k]-h0) <= 1); }},
            { id: 'speed_run', icon: '✦', title: '闪电记账', desc: '一分钟内记了3笔', check: (ctx) => { if (ctx.action !== 'record') return false; const now = Date.now(); const recent = txs.filter(t => now - new Date(t.date).getTime() < 60000); return recent.length >= 3; }},
            { id: 'archaeologist', icon: '✦', title: '考古学家', desc: '记录了30天前的消费', check: (ctx) => { if (ctx.action !== 'record' || !ctx.date) return false; return (Date.now() - new Date(ctx.date).getTime()) > 30*86400000; }},
            { id: 'cat_king', icon: '✦', title: '品类王者', desc: '某分类连续30天都有消费', check: (ctx) => { if (ctx.action !== 'record') return false; const cats = {}; txs.filter(t=>t.type==='expense').forEach(t=>{ const d=t.date.slice(0,10); if(!cats[t.cat]) cats[t.cat]=new Set(); cats[t.cat].add(d); }); const now=new Date(); for(let c in cats){ let streak=0; for(let i=0;i<30;i++){ const d=new Date(now); d.setDate(d.getDate()-i); if(cats[c].has(d.toISOString().slice(0,10))) streak++; else break; } if(streak>=30) return true; } return false; }},
            { id: 'centurion', icon: '✦', title: '百笔斩', desc: '累计记账100笔', check: (ctx) => ctx.action === 'record' && txs.length >= 100 },
        ];

        function getUnlockedAchievements() {
            return JSON.parse(nfStorage.getItem('achievements') || '[]');
        }
        function saveAchievement(id) {
            const list = getUnlockedAchievements();
            if (!list.includes(id)) { list.push(id); nfStorage.setItem('achievements', JSON.stringify(list)); }
        }

        function checkAchievements(ctx) {
            const unlocked = getUnlockedAchievements();
            for (const ach of ACHIEVEMENTS) {
                if (unlocked.includes(ach.id)) continue;
                try {
                    if (ach.check(ctx)) {
                        saveAchievement(ach.id);
                        showAchievementPopup(ach);
                    }
                } catch(e) {}
            }
        }

        function showAchievementPopup(ach) {
            const el = document.createElement('div');
            el.className = 'fixed inset-0 z-[200] flex items-center justify-center';
            el.style.background = 'rgba(0,0,0,0.6)';
            el.style.backdropFilter = 'blur(8px)';
            el.style.animation = 'fadeSlideIn 0.3s ease-out';
            const iconName = (typeof achIconMap !== 'undefined' && achIconMap[ach.id]) || 'award';
            el.innerHTML = `<div class="relative max-w-[300px] w-[85vw] text-center" style="animation:fadeSlideIn 0.5s cubic-bezier(0.16,1,0.3,1)">
                <!-- Glow burst -->
                <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] rounded-full" style="background:radial-gradient(circle,rgba(124,58,237,0.3) 0%,transparent 70%);filter:blur(40px);animation:pulse-glow 2s ease-in-out infinite"></div>
                <!-- Card -->
                <div class="relative rounded-[28px] overflow-hidden p-8" style="background:linear-gradient(180deg,rgba(124,58,237,0.08) 0%,rgba(10,10,12,0.95) 40%);backdrop-filter:blur(20px);box-shadow:0 24px 80px -12px rgba(124,58,237,0.3),inset 0 1px 0 rgba(255,255,255,0.06)">
                    <!-- Confetti particles -->
                    <div class="absolute inset-0 overflow-hidden pointer-events-none">
                        <div class="absolute w-1.5 h-1.5 rounded-full bg-purple-400/60" style="top:15%;left:20%;animation:starTwinkle 1.5s ease-in-out infinite"></div>
                        <div class="absolute w-1 h-1 rounded-full bg-indigo-400/50" style="top:25%;right:18%;animation:starTwinkle 2s ease-in-out infinite 0.3s"></div>
                        <div class="absolute w-1.5 h-1.5 rounded-full bg-fuchsia-400/40" style="top:10%;left:55%;animation:starTwinkle 1.8s ease-in-out infinite 0.6s"></div>
                        <div class="absolute w-1 h-1 rounded-full bg-violet-300/50" style="top:20%;right:35%;animation:starTwinkle 2.2s ease-in-out infinite 0.9s"></div>
                        <div class="absolute w-1 h-1 rounded-full bg-purple-300/40" style="bottom:30%;left:15%;animation:starTwinkle 1.6s ease-in-out infinite 0.4s"></div>
                    </div>
                    <!-- Close -->
                    <button onclick="this.closest('.fixed').remove()" class="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06] text-white/40 active:scale-90 transition-transform z-10">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                    <!-- Icon badge -->
                    <div class="relative mx-auto w-[72px] h-[72px] rounded-full flex items-center justify-center mb-5" style="background:linear-gradient(135deg,rgba(124,58,237,0.25),rgba(168,85,247,0.1));box-shadow:0 0 24px rgba(124,58,237,0.2)">
                        <i data-lucide="${iconName}" class="w-8 h-8 text-cyber-purple"></i>
                    </div>
                    <!-- Badge label -->
                    <div class="inline-block px-3 py-1 rounded-full mb-3" style="background:linear-gradient(90deg,rgba(124,58,237,0.15),rgba(168,85,247,0.08))">
                        <span class="text-[14px] text-purple-300 tracking-wide font-semibold">${t('level_achievement_unlock')}</span>
                    </div>
                    <!-- Title -->
                    <div class="text-[20px] font-bold text-white mb-2">「${achTitle(ach.id)}」</div>
                    <!-- Description -->
                    <div class="text-[14px] text-white/50 leading-relaxed mb-5">${achDesc(ach.id)}</div>
                    <!-- Confirm button -->
                    <button onclick="this.closest('.fixed').remove()" class="w-full py-3 rounded-full text-[14px] font-medium text-white active:scale-[0.96] transition-transform" style="background:linear-gradient(135deg,#7c3aed,#a855f7);box-shadow:0 4px 16px -4px rgba(124,58,237,0.4)">${currentLang==='zh'?'知道了':currentLang==='ja'?'了解':currentLang==='ko'?'확인':'Got it'}</button>
                </div>
            </div>`;
            document.body.appendChild(el);
            lucide.createIcons();
        }

        function openLevelPanel() {
            const d = getLevelData();
            const unlocked = getUnlockedAchievements();
            const el = document.getElementById('level-panel-content');
            const nextLvl = d.level < LEVELS.length - 1 ? LEVELS[d.level + 1] : null;
            const pctTx = nextLvl ? Math.min(100, Math.round((d.totalTx / nextLvl.minTx) * 100)) : 100;
            const pctDays = nextLvl && nextLvl.minDays > 0 ? Math.min(100, Math.round((d.streak / nextLvl.minDays) * 100)) : 100;
            const pctBudget = nextLvl && nextLvl.budgetHits > 0 ? Math.min(100, Math.round((d.budgetHits / nextLvl.budgetHits) * 100)) : 100;
            const overallPct = nextLvl ? Math.round((pctTx + pctDays + pctBudget) / 3) : 100;
            const circ = 2 * Math.PI * 54;
            const offset = circ - (overallPct / 100) * circ;

            // --- HERO: Large immersive ring with ambient glow ---
            const heroHtml = `<div class="relative flex flex-col items-center pb-3 mb-3" style="animation:fadeSlideIn 0.6s ease-out both">
                <!-- Ambient orbs -->
                <div class="absolute top-4 left-1/2 -translate-x-1/2 w-[200px] h-[200px] rounded-full opacity-[0.08]" style="background:radial-gradient(circle,#7c3aed 0%,transparent 60%);filter:blur(30px)"></div>
                <div class="absolute top-12 left-[30%] w-[60px] h-[60px] rounded-full opacity-[0.05]" style="background:#6366f1;filter:blur(20px);animation:orbFloat 6s ease-in-out infinite"></div>
                <div class="absolute top-8 right-[25%] w-[40px] h-[40px] rounded-full opacity-[0.04]" style="background:#a855f7;filter:blur(15px);animation:orbFloat 8s ease-in-out infinite reverse"></div>

                <!-- Ring -->
                <div class="relative w-[110px] h-[110px] mt-2 mb-4">
                    <svg class="w-full h-full" viewBox="0 0 120 120" style="filter:drop-shadow(0 0 12px rgba(124,58,237,0.25))">
                        <defs>
                            <linearGradient id="lvl-ring" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#7c3aed"/><stop offset="50%" stop-color="#a855f7"/><stop offset="100%" stop-color="#818cf8"/></linearGradient>
                            <linearGradient id="lvl-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="rgba(255,255,255,0.03)"/><stop offset="100%" stop-color="rgba(255,255,255,0.01)"/></linearGradient>
                        </defs>
                        <circle cx="60" cy="60" r="54" fill="none" stroke="url(#lvl-bg)" stroke-width="6"/>
                        <circle cx="60" cy="60" r="54" fill="none" stroke="url(#lvl-ring)" stroke-width="6" stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="${circ}" stroke-dashoffset="${offset}" style="transition:stroke-dashoffset 1.8s cubic-bezier(0.22,1,0.36,1)"/>
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                        <div class="text-[28px] font-bold text-white font-num leading-none" style="background:linear-gradient(180deg,#fff 30%,rgba(255,255,255,0.6));-webkit-background-clip:text;-webkit-text-fill-color:transparent">${d.level}</div>
                        <div class="text-[9px] text-white/25 uppercase tracking-[3px] mt-1">level</div>
                    </div>
                </div>

                <!-- Title -->
                <div class="text-[18px] font-semibold text-white tracking-tight">${lvlTitle(d.level)}</div>
                <div class="text-[12px] text-white/30 mt-1">${lvlDesc(d.level)}</div>
                ${nextLvl ? `<div class="flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full" style="background:rgba(255,255,255,0.03)">
                    <span class="text-[10px] text-white/30">Next</span>
                    <div class="w-[60px] h-[3px] rounded-full bg-white/[0.06] overflow-hidden"><div class="h-full rounded-full" style="width:${overallPct}%;background:linear-gradient(90deg,#7c3aed,#a855f7);transition:width 1.5s ease"></div></div>
                    <span class="text-[10px] text-[#a855f7] font-num font-medium">${overallPct}%</span>
                </div>` : `<div class="mt-3 px-3 py-1.5 rounded-full text-[10px] font-medium tracking-wider" style="background:linear-gradient(90deg,rgba(124,58,237,0.15),rgba(168,85,247,0.1));color:#c084fc;border:1px solid rgba(168,85,247,0.15)">MAX LEVEL</div>`}
            </div>`;

            // --- STATS: Single row with colored gradient backgrounds ---
            const statsHtml = `<div class="grid grid-cols-3 gap-2 mb-5" style="animation:fadeSlideIn 0.6s ease-out both;animation-delay:0.1s">
                <div class="rounded-[16px] p-3 text-center relative overflow-hidden" style="background:linear-gradient(160deg,rgba(249,115,22,0.1) 0%,rgba(249,115,22,0.02) 100%)">
                    <div class="absolute -top-3 -right-3 w-14 h-14 rounded-full opacity-[0.08]" style="background:#f97316;filter:blur(10px)"></div>
                    <div class="text-[22px] font-bold text-white font-num leading-none relative">${d.streak}</div>
                    <div class="text-[12px] text-white/25 mt-1 relative">${t('level_streak')}</div>
                </div>
                <div class="rounded-[16px] p-3 text-center relative overflow-hidden" style="background:linear-gradient(160deg,rgba(124,58,237,0.1) 0%,rgba(124,58,237,0.02) 100%)">
                    <div class="absolute -top-3 -right-3 w-14 h-14 rounded-full opacity-[0.08]" style="background:#7c3aed;filter:blur(10px)"></div>
                    <div class="text-[22px] font-bold text-white font-num leading-none relative">${d.totalTx}</div>
                    <div class="text-[12px] text-white/25 mt-1 relative">${t('level_total_tx')}</div>
                </div>
                <div class="rounded-[16px] p-3 text-center relative overflow-hidden" style="background:linear-gradient(160deg,rgba(34,197,94,0.1) 0%,rgba(34,197,94,0.02) 100%)">
                    <div class="absolute -top-3 -right-3 w-14 h-14 rounded-full opacity-[0.08]" style="background:#22c55e;filter:blur(10px)"></div>
                    <div class="text-[22px] font-bold text-white font-num leading-none relative">${d.budgetHits}</div>
                    <div class="text-[12px] text-white/25 mt-1 relative">${t('level_budget_hits')}</div>
                </div>
            </div>`;

            // --- NEXT LEVEL REQUIREMENTS ---
            const reqHtml = nextLvl ? `<div class="rounded-[20px] p-4 mb-5 relative overflow-hidden" style="background:rgba(255,255,255,0.015);border:1px solid rgba(255,255,255,0.04);animation:fadeSlideIn 0.6s ease-out both;animation-delay:0.15s">
                <div class="flex items-center gap-2 mb-4">
                    <div class="w-6 h-6 rounded-full flex items-center justify-center" style="background:linear-gradient(135deg,#7c3aed,#6366f1)"><i data-lucide="arrow-up" class="w-3 h-3 text-white"></i></div>
                    <span class="text-[12px] text-white/60 font-medium">${lvlTitle(d.level + 1)}</span>
                    <span class="text-[9px] text-white/20 ml-auto uppercase tracking-wider">next</span>
                </div>
                <div class="space-y-3">
                    <div>
                        <div class="flex justify-between text-[10px] mb-1.5"><span class="text-white/35">${t('level_total_tx')}</span><span class="font-num ${pctTx >= 100 ? 'text-green-400/80' : 'text-white/25'}">${d.totalTx}/${nextLvl.minTx}</span></div>
                        <div class="h-[4px] rounded-full overflow-hidden" style="background:rgba(255,255,255,0.04)"><div class="h-full rounded-full" style="width:${pctTx}%;background:linear-gradient(90deg,#7c3aed,#a855f7);box-shadow:0 0 8px rgba(124,58,237,0.3);transition:width 1.2s ease"></div></div>
                    </div>
                    ${nextLvl.minDays > 0 ? `<div>
                        <div class="flex justify-between text-[10px] mb-1.5"><span class="text-white/35">${t('level_streak')}</span><span class="font-num ${pctDays >= 100 ? 'text-green-400/80' : 'text-white/25'}">${d.streak}/${nextLvl.minDays}</span></div>
                        <div class="h-[4px] rounded-full overflow-hidden" style="background:rgba(255,255,255,0.04)"><div class="h-full rounded-full" style="width:${pctDays}%;background:linear-gradient(90deg,#f97316,#fbbf24);box-shadow:0 0 8px rgba(249,115,22,0.3);transition:width 1.2s ease"></div></div>
                    </div>` : ''}
                    ${nextLvl.budgetHits > 0 ? `<div>
                        <div class="flex justify-between text-[10px] mb-1.5"><span class="text-white/35">${t('level_budget_hits')}</span><span class="font-num ${pctBudget >= 100 ? 'text-green-400/80' : 'text-white/25'}">${d.budgetHits}/${nextLvl.budgetHits}</span></div>
                        <div class="h-[4px] rounded-full overflow-hidden" style="background:rgba(255,255,255,0.04)"><div class="h-full rounded-full" style="width:${pctBudget}%;background:linear-gradient(90deg,#22c55e,#86efac);box-shadow:0 0 8px rgba(34,197,94,0.3);transition:width 1.2s ease"></div></div>
                    </div>` : ''}
                </div>
            </div>` : '';

            // --- ACHIEVEMENTS: Chip pills with Lucide icons ---
            const allAch = ACHIEVEMENTS || [];
            const achIconMap = {triple:'layers',streak3:'flame',budget_set:'sliders',ten_records:'archive',night_owl:'moon',big_day:'trending-up',zero_spend:'leaf',all_round:'crosshair',round_lover:'circle',early_bird:'alarm-clock',speed_run:'zap',archaeologist:'pickaxe',cat_king:'crown',centurion:'hash'};
            const achHtml = unlocked.length > 0 ? `<div class="rounded-[20px] p-5 mb-5 relative overflow-hidden" style="background:linear-gradient(160deg,rgba(255,255,255,0.02) 0%,rgba(168,85,247,0.03) 50%,rgba(99,102,241,0.02) 100%);border:1px solid rgba(255,255,255,0.04);animation:fadeSlideIn 0.6s ease-out both;animation-delay:0.2s">
                <div class="absolute top-0 right-1/4 w-[150px] h-[80px] rounded-full opacity-[0.03]" style="background:radial-gradient(circle,#a855f7,transparent);filter:blur(30px)"></div>
                <div class="flex items-center justify-between mb-4">
                    <span class="text-[13px] text-white/50 font-medium">${t('level_achievements')}</span>
                    <span class="text-[10px] text-white/20 font-num px-2 py-0.5 rounded-full" style="background:rgba(255,255,255,0.04)">${unlocked.length} / ${allAch.length}</span>
                </div>
                <div class="flex flex-wrap gap-2">${unlocked.map(id => {
                    const a = allAch.find(x => x.id === id);
                    if (!a) return '';
                    const ic = achIconMap[a.id] || 'award';
                    return `<div class="inline-flex items-center gap-2 pl-2.5 pr-3.5 py-2 rounded-full" style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.12)">
                        <div class="w-[22px] h-[22px] rounded-full flex items-center justify-center" style="background:linear-gradient(135deg,#a855f7,#7c3aed);box-shadow:0 0 8px rgba(168,85,247,0.3)"><i data-lucide="${ic}" class="w-[12px] h-[12px] text-white"></i></div>
                        <span class="text-[13px] text-white/70 font-medium">${achTitle(a.id)}</span>
                    </div>`;
                }).join('')}</div>
            </div>` : '';

            // --- LEVEL ROADMAP: Horizontal rail with stations ---
            const lvlIcons = ['coins','book-open','search','crosshair','shield','piggy-bank','activity','scissors','zap','anchor','flag','scan','pause','sparkles','hammer','clock','moon','flower-2','compass','sun','infinity'];
            const colors = ['#9ca3af','#fb923c','#f87171','#fbbf24','#a78bfa','#4ade80','#22d3ee','#f472b6','#facc15','#6366f1','#34d399','#38bdf8','#f97316','#c084fc','#fb7185','#fcd34d','#818cf8','#5eead4','#a855f7','#fbbf24','#c084fc'];
            const levelHtml = `<div class="rounded-[20px] p-5 relative overflow-hidden" style="background:linear-gradient(160deg,rgba(255,255,255,0.02) 0%,rgba(124,58,237,0.03) 50%,rgba(59,130,246,0.02) 100%);border:1px solid rgba(255,255,255,0.04);animation:fadeSlideIn 0.6s ease-out both;animation-delay:0.25s">
                <div class="absolute top-0 left-1/4 w-[200px] h-[100px] rounded-full opacity-[0.03]" style="background:radial-gradient(circle,#7c3aed,transparent);filter:blur(40px)"></div>
                <div class="flex items-center justify-between mb-5">
                    <span class="text-[13px] text-white/50 font-medium">${t('level_route')}</span>
                    <span class="text-[10px] text-white/20 font-num px-2 py-0.5 rounded-full" style="background:rgba(255,255,255,0.04)">${d.level} / ${LEVELS.length - 1}</span>
                </div>
                <div class="overflow-x-auto no-scrollbar -mx-2">
                    <div class="relative" style="width:${LEVELS.length * 130}px;padding-top:12px;padding-bottom:60px">
                        <!-- Rail track base -->
                        <div class="absolute top-[28px] left-[30px] right-[30px] h-[3px] rounded-full" style="background:linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))"></div>
                        <!-- Rail track active -->
                        <div class="absolute top-[28px] left-[30px] h-[3px] rounded-full" style="width:${Math.max(0, d.level) * 130}px;background:linear-gradient(90deg,${colors[0]},${colors[Math.min(d.level, colors.length - 1)]});box-shadow:0 0 12px ${colors[d.level]}44,0 0 4px ${colors[d.level]}66;transition:width 1.2s cubic-bezier(0.22,1,0.36,1)"></div>

                        <!-- Stations -->
                        <div class="relative flex">${LEVELS.map((lvl, i) => {
                            const isCurrent = i === d.level;
                            const isLocked = i > d.level;
                            const isPast = i < d.level;
                            const c = colors[i];
                            return `<div class="flex-shrink-0 w-[130px] flex flex-col items-center">
                                <!-- Node -->
                                <div class="relative mb-3">
                                    ${isCurrent ? `<div class="absolute inset-[-10px] rounded-full" style="background:radial-gradient(circle,${c}30,transparent);animation:pulse-glow 3s ease-in-out infinite"></div>` : ''}
                                    ${isCurrent || isPast ? `<div class="absolute inset-[-3px] rounded-full" style="background:linear-gradient(135deg,${c}88,${c}22);"></div>` : ''}
                                    <div class="relative w-[34px] h-[34px] rounded-full flex items-center justify-center" style="background:${isCurrent || isPast ? `linear-gradient(135deg,${c},${c}bb)` : 'rgba(255,255,255,0.08)'};box-shadow:${isCurrent ? `0 0 20px ${c}55,0 4px 12px ${c}44,inset 0 1px 0 rgba(255,255,255,0.2)` : isPast ? `0 0 12px ${c}33,0 2px 8px ${c}22,inset 0 1px 0 rgba(255,255,255,0.15)` : 'inset 0 1px 0 rgba(255,255,255,0.08),0 0 0 1px rgba(255,255,255,0.08)'};${isLocked ? 'opacity:0.6' : ''}">
                                        ${isCurrent ? `<i data-lucide="${lvlIcons[i]}" class="w-[16px] h-[16px] text-white" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))"></i>` : isPast ? `<i data-lucide="check" class="w-[16px] h-[16px] text-white" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))"></i>` : `<i data-lucide="${lvlIcons[i]}" class="w-[14px] h-[14px]" style="color:rgba(255,255,255,0.25)"></i>`}
                                    </div>
                                </div>
                                <!-- Label -->
                                <div class="text-center px-1.5">
                                    <div class="text-[14px] leading-tight font-medium ${isCurrent ? 'text-white' : isPast ? 'text-white/50' : 'text-white/20'}">${lvlTitle(i)}</div>
                                    <div class="text-[12px] mt-1 leading-tight ${isCurrent ? 'text-white/35' : isPast ? 'text-white/20' : 'text-white/10'}">${lvlDesc(i)}</div>
                                </div>
                            </div>`;
                        }).join('')}</div>
                    </div>
                </div>
            </div>`;

            el.innerHTML = heroHtml + statsHtml + achHtml + levelHtml;
            document.getElementById('level-panel-modal').classList.remove('hidden');
            lucide.createIcons();
            // Auto-scroll rail to center current level
            setTimeout(() => {
                const rail = el.querySelector('.overflow-x-auto');
                if (rail) rail.scrollLeft = Math.max(0, d.level * 120 - rail.offsetWidth / 2 + 60);
            }, 100);
        }

        function closeLevelPanel() {
            document.getElementById('level-panel-modal').classList.add('hidden');
        }

        // --- i18n ---
        let currentLang = nfStorage.getItem('lang') || 'zh';
        const i18n = {
            zh: {
                tab_home: '首页', tab_chat: '智能', tab_stats: '统计', tab_profile: '我的',
                profile_title: '账本管理', profile_subtitle: '账本、预算与偏好设置',
                books_title: '我的账本', books_manage: '我的账本',
                settings_title: '设置', lang_label: '语言', currency_label: '币种',
                speech_api_label: '语音识别', api_not_set: '未设置', api_set: '已设置',
                api_key_title: '语音识别设置', api_key_desc: '输入 Gemini API Key 以在主屏幕模式下使用语音功能', api_key_placeholder: '粘贴 API Key...', api_key_save: '保存', api_key_clear: '清除',
                theme_label: '深色模式', data_label: '数据管理', data_clear: '清除所有数据',
                confirm_clear: '确定清除所有数据？此操作不可恢复！',
                greeting_morning: '早上好', greeting_afternoon: '下午好', greeting_evening: '晚上好',
                month_expense: '本月支出', month_income: '收入', net: '净收支',
                recent_bills: '近期账单', no_records: '暂无记录', no_records_hint: '记下第一笔，开启你的财务旅程', load_more: '加载更多',
                add_tx: '记一笔', budget_btn: '预算设置', expense_cal_btn: '支出日历',
                income: '收入', expense: '支出', all: '全部',
                trend_title: '收支趋势', cat_title: '类别排行',
                export_btn: '导出账单', ai_title: 'AI 记账助手',
                ai_subtitle: '说句话就能记账、查账、改账、删账',
                ai_welcome: '你的钱包已上线，随时待命 💰', ai_intro: '直接告诉我花了什么钱，我帮你记住一切',
                ai_guide: '试试对我说：\n\n　<i data-lucide="coffee" class="w-3.5 h-3.5 inline-block text-white/40"></i> "星巴克38"\n　<i data-lucide="car" class="w-3.5 h-3.5 inline-block text-white/40"></i> "打车18.8"\n　<i data-lucide="search" class="w-3.5 h-3.5 inline-block text-white/40"></i> "本月奶茶花了多少"\n　<i data-lucide="bar-chart-3" class="w-3.5 h-3.5 inline-block text-white/40"></i> "总结" 看月报\n　<i data-lucide="trending-up" class="w-3.5 h-3.5 inline-block text-white/40"></i> "预测" 看月末预计',
                summary_btn: '月度总结', input_placeholder: '输入...',
                cat_manage: '分类管理', export_short: '导出',
                filter_month: '本月', filter_3m: '3月', filter_6m: '半年',
                filter_year: '1年', filter_all: '全部', filter_custom: '范围',
                filter_time: '筛选时间', cancel: '取消', confirm: '确认',
                by_month: '按月', by_year: '按年', by_day: '按日', by_range: '范围',
                start: '开始', end: '结束',
                all_cats: '分类', all_types: '收支', all_expense: '支出', all_income: '收入',
                this_month: '本月', select_cat: '选择分类',
                modal_add: '记一笔', modal_edit: '编辑账单',
                cat_label: '分类', date_label: '日期', note_label: '备注',
                manage: '管理', delete: '删除',
                stats_title: '收支统计',
                book_daily: '日常', book_travel: '旅游', book_family: '家庭',
                book_business: '生意', book_reimburse: '报销', book_company: '公司', book_team: '团队',
                cat_food: '餐饮', cat_transport: '交通', cat_shopping: '购物', cat_tech: '游戏',
                cat_utilities: '生活', cat_entertainment: '娱乐', cat_other: '其他',
                cat_salary: '工资', cat_bonus: '奖金', cat_investment: '理财', cat_other_in: '其他',
                total_budget: '总预算', save: '保存', add: '添加',
                budget_title: '预算设置', budget_stats: '预算', monthly_budget: '每月总预算',
                cat_budget: '分类预算（选填）', amount_placeholder: '金额',
                new_book: '新账本名称...', note_placeholder: '输入备注...',
                no_stats_data: '暂无收支数据', expense_section: '支出分类', income_section: '收入分类',
                no_budget_yet: '还没有设置预算', please_select_cat: '请选择分类',
                please_enter_amount: '请输入有效金额',
                budget_set_toast: '预算已设为', budget_removed_toast: '已移除预算',
                total_budget_set: '总预算已设为', total_budget_cleared: '已清除总预算',
                budget_used: '已用', budget_remain: '剩余', budget_overspent: '已超支',
                budget_over: '已超预算', budget_warning: '预算剩余', budget_unlimited: '不限',
                voice_listening: '正在听...',
                enter_amount: '请输入金额', no_future_date: '不能选择未来日期', enter_note: '请输入备注',
                added_cat: '已添加分类', removed_cat: '已移除分类',
                max_cats: '最多支持15个分类', enter_cat_name: '请输入分类名称',
                level_title: '等级轨迹', level_current: '当前', level_streak: '连续天数', level_total_tx: '总记账笔数', level_budget_hits: '预算达标', level_route: '等级路线', level_achievements: '已解锁成就', level_achievement_unlock: '隐藏成就解锁', level_req: (days, tx, hits) => `连续${days}天 · ${tx}笔 · 预算达标${hits}次`,
                edit_cat: '编辑分类', tap_change_icon: '点击换图标', cat_created: (name) => `已创建分类「${name}」并归入`, cat_learned: (desc, label) => `已学习：「${desc}」→ ${label}`, level_up: (title) => `▲ 升级！你现在是「${title}」`,
                level_names: ['金币散落者','账本见习生','支出侦探','小数点猎人','预算学徒','存钱罐守卫','周期观测员','消费断舍离','记账连击王','预算驯兽师','副本通关者','数字感知师','冲动克制者','财务结界术士','资产锻造匠','复利领悟者','被动收入猎手','消费禅修者','财务自由行者','金融觉醒者','经济永动机'],
                level_descs: ['口袋有洞但不自知','第一次打开了记录','跟踪每一笔去向','连零头都不放过','给欲望画了条线','月底终于有余额了','发现了月中综合症','删掉了三个购物App','手速已超过花钱速度','欲望被你套上了缰','第一次月度达标','看一眼就知道贵不贵','购物车清空改收藏','不该花的钱进不来','每一分都有去处','开始理解时间的价格','睡觉时钱也在动','花与不花皆自在','钱为你工作','财富只是副产品','系统已自行运转'],
                ach_names: {first_blood:'第一滴血',triple:'七连击',streak3:'三日之约',budget_set:'画线大师',ten_records:'初具规模',night_owl:'凌晨经济学家',big_day:'日入斗金',zero_spend:'断舍离',all_round:'精确制导',round_lover:'强迫症确诊',early_bird:'时间管理大师',speed_run:'闪电记账',archaeologist:'考古学家',cat_king:'品类王者',centurion:'百笔斩'},
                ach_descs: {first_blood:'记录了第一笔账',triple:'累计记账7笔',streak3:'连续记账3天',budget_set:'第一次设置了预算',ten_records:'累计记账10笔',night_owl:'凌晨2-5点记了一笔账',big_day:'单笔收入超过10,000',zero_spend:'连续7天零支出',all_round:'月预算使用率在95%-105%之间',round_lover:'连续20笔金额全是整数',early_bird:'连续7天在同一小时内记账',speed_run:'一分钟内记了3笔',archaeologist:'记录了30天前的消费',cat_king:'某分类连续30天都有消费',centurion:'累计记账100笔'},
                comeback_msgs: ['欢迎回来，你的钱没等你，但我等了','失踪人口回归！这几天花的钱，它们不会自己记的','回来就好，你不在的时候余额哭了好几次'],
                today: '今天', yesterday: '昨天',
                close: '关闭', new_cat_placeholder: '新分类...',
                enter_book_name: '请输入账本名称', book_created: '已创建账本',
                book_deleted: '已删除账本', cannot_delete_current: '不能删除当前账本',
                book_edit_title: '编辑账本', book_name_label: '账本名称', book_new_placeholder: '新建账本...',
                book_add: '添加', book_delete_warn: '删除账本将清除该账本下所有记录，此操作不可撤销。',
                book_delete_confirm_label: '输入账本名称以确认删除', book_delete_confirm_placeholder: '输入账本名称...',
                book_delete_btn: '删除账本',
                toast_updated: '已更新', toast_recorded: '已记录', toast_deleted: '已删除',
                toast_switched_to: '已切换到', toast_avatar_updated: '头像已更新', toast_avatar_restored: '已恢复默认头像', toast_nickname_updated: '昵称已更新',
                avatar_upload: '上传头像', avatar_restore: '恢复默认头像', avatar_cancel: '取消',
                toast_restored: '条记录',
                pro_unlock: '高级AI功能', pro_unlock_short: 'Pro', pro_locked: '未解锁',
                pro_title: '高级AI功能', pro_desc: '选择AI供应商并输入API Key，解锁智能对话能力',
                pro_placeholder: '粘贴 API Key...', pro_save: '激活', pro_clear: '关闭高级',
                pro_provider_label: '供应商', pro_model_label: '模型', pro_model_name: '模型名称',
                pro_error_invalid: 'API Key 无效，已自动关闭 Pro。请重新设置。',
                pro_error_rate_limit: '供应商限流，已切回离线AI，可去设置换供应商',
                pro_error_failed: '连接失败，已用离线模式回复。',
                pro_error_vpn_hint: '该服务需要科学上网，国内推荐切换为通义千问',
                pro_error_switch: '切换设置',
                pro_activated: '高级AI已激活', pro_cleared: '已关闭高级功能',
                pro_active: '已激活', pro_thinking: '思考中...'
            },
            en: {
                tab_home: 'Home', tab_chat: 'AI', tab_stats: 'Stats', tab_profile: 'Me',
                profile_title: 'Ledger', profile_subtitle: 'Books, budget & preferences',
                books_title: 'My Books', books_manage: 'My Books',
                settings_title: 'Settings', lang_label: 'Language', currency_label: 'Currency',
                speech_api_label: 'Speech', api_not_set: 'Not set', api_set: 'Configured',
                api_key_title: 'Speech Recognition', api_key_desc: 'Enter Gemini API Key to use voice in home screen mode', api_key_placeholder: 'Paste API Key...', api_key_save: 'Save', api_key_clear: 'Clear',
                theme_label: 'Dark Mode', data_label: 'Data', data_clear: 'Clear All Data',
                confirm_clear: 'Clear all data? This cannot be undone!',
                greeting_morning: 'Good Morning', greeting_afternoon: 'Good Afternoon', greeting_evening: 'Good Evening',
                month_expense: 'Expense', month_income: 'Income', net: 'Net',
                recent_bills: 'Transactions', no_records: 'No records yet', no_records_hint: 'Start your finance journey', load_more: 'Load more',
                add_tx: 'Add', budget_btn: 'Budget', expense_cal_btn: 'Spending',
                income: 'Income', expense: 'Expense', all: 'All',
                trend_title: 'Trends', cat_title: 'Top Categories',
                export_btn: 'Export', ai_title: 'AI Assistant',
                ai_subtitle: 'Add, query, edit or delete by voice or text',
                ai_welcome: 'Hi~ Welcome to AI Bookkeeping', ai_intro: "I'm your AI bookkeeping assistant",
                ai_guide: 'Try saying:\n\n　<i data-lucide="coffee" class="w-3.5 h-3.5 inline-block text-white/40"></i> "Starbucks 38"\n　<i data-lucide="car" class="w-3.5 h-3.5 inline-block text-white/40"></i> "Taxi 18.8"\n　<i data-lucide="search" class="w-3.5 h-3.5 inline-block text-white/40"></i> "How much on food this month"\n　<i data-lucide="bar-chart-3" class="w-3.5 h-3.5 inline-block text-white/40"></i> "Summary" for report\n　<i data-lucide="trending-up" class="w-3.5 h-3.5 inline-block text-white/40"></i> "Forecast" for predictions',
                summary_btn: 'Summary', input_placeholder: 'Type...',
                cat_manage: 'Categories', export_short: 'Export',
                filter_month: '1M', filter_3m: '3M', filter_6m: '6M',
                filter_year: '1Y', filter_all: 'All', filter_custom: 'Range',
                filter_time: 'Date Filter', cancel: 'Cancel', confirm: 'Done',
                by_month: 'Month', by_year: 'Year', by_day: 'Day', by_range: 'Range',
                start: 'From', end: 'To',
                all_cats: 'Category', all_types: 'Type', all_expense: 'Expense', all_income: 'Income',
                this_month: 'This Month', select_cat: 'Category',
                modal_add: 'New Entry', modal_edit: 'Edit',
                cat_label: 'Category', date_label: 'Date', note_label: 'Note',
                manage: 'Manage', delete: 'Delete',
                stats_title: 'Statistics',
                book_daily: 'Daily', book_travel: 'Travel', book_family: 'Family',
                book_business: 'Business', book_reimburse: 'Reimburse', book_company: 'Company', book_team: 'Team',
                cat_food: 'Food', cat_transport: 'Transport', cat_shopping: 'Shopping', cat_tech: 'Gaming',
                cat_utilities: 'Life', cat_entertainment: 'Entertainment', cat_other: 'Other',
                cat_salary: 'Salary', cat_bonus: 'Bonus', cat_investment: 'Finance', cat_other_in: 'Other',
                total_budget: 'Total', save: 'Save', add: 'Add',
                budget_title: 'Budget', budget_stats: 'Budget', monthly_budget: 'Monthly Budget',
                cat_budget: 'By category (optional)', amount_placeholder: 'Amount',
                new_book: 'New book name...', note_placeholder: 'Add a note...',
                no_stats_data: 'No data yet', expense_section: 'Expense', income_section: 'Income',
                no_budget_yet: 'No budgets set', please_select_cat: 'Please select a category',
                please_enter_amount: 'Please enter a valid amount',
                budget_set_toast: 'budget set to', budget_removed_toast: 'budget removed',
                total_budget_set: 'Total budget set to', total_budget_cleared: 'Total budget cleared',
                budget_used: 'Used', budget_remain: 'Left', budget_overspent: 'Overspent',
                budget_over: 'Over budget', budget_warning: 'Remaining', budget_unlimited: 'Unlimited',
                voice_listening: 'Listening...',
                enter_amount: 'Please enter amount', enter_note: 'Please enter a note',
                added_cat: 'Category added', removed_cat: 'Category removed',
                max_cats: 'Max 15 categories', enter_cat_name: 'Please enter category name',
                level_title: 'Level Progress', level_current: 'Current', level_streak: 'Streak', level_total_tx: 'Total Records', level_budget_hits: 'Budget Hits', level_route: 'Level Path', level_achievements: 'Achievements Unlocked', level_achievement_unlock: 'Hidden Achievement Unlocked', level_req: (days, tx, hits) => `${days}d streak · ${tx} records · ${hits} budget hits`,
                edit_cat: 'Edit Category', tap_change_icon: 'Tap to change icon', cat_created: (name) => `Created category "${name}"`, cat_learned: (desc, label) => `Learned: "${desc}" → ${label}`, level_up: (title) => `▲ Level up! Now "${title}"`,
                level_names: ['Coin Dropper','Ledger Rookie','Expense Detective','Decimal Hunter','Budget Apprentice','Piggy Bank Guard','Cycle Observer','Spending Minimalist','Logging Streak King','Budget Tamer','Dungeon Clearer','Price Sensor','Impulse Blocker','Finance Barrier Mage','Asset Forger','Compound Awakener','Passive Income Hunter','Spending Monk','Financial Nomad','Finance Enlightened','Perpetual Engine'],
                level_descs: ['Pockets have holes','First time opening records','Tracking every expense','Even decimals count','Drew a line for desires','Finally have balance at month end','Found the mid-month syndrome','Deleted three shopping apps','Logging faster than spending','Desires are on a leash','First monthly goal hit','Know if it\'s pricey at a glance','Cart cleared to wishlist','Unwanted spending blocked','Every cent has a purpose','Understanding time\'s price','Money moves while you sleep','Spending or not, at peace','Money works for you','Wealth is just a byproduct','The system runs itself'],
                ach_names: {first_blood:'First Blood',triple:'Lucky Seven',streak3:'3-Day Pact',budget_set:'Line Drawer',ten_records:'Taking Shape',night_owl:'Night Owl Economist',big_day:'Big Payday',zero_spend:'Minimalist',all_round:'Precision Strike',round_lover:'OCD Confirmed',early_bird:'Time Manager',speed_run:'Speed Logger',archaeologist:'Archaeologist',cat_king:'Category King',centurion:'Century Club'},
                ach_descs: {first_blood:'Logged your first entry',triple:'7 entries total',streak3:'Logged 3 days in a row',budget_set:'Set your first budget',ten_records:'10 entries total',night_owl:'Logged an expense at 2-5 AM',big_day:'Single income over 10,000',zero_spend:'Zero spending for 7 days straight',all_round:'Monthly budget usage between 95%-105%',round_lover:'20 consecutive round-number entries',early_bird:'Logged at the same hour for 7 days',speed_run:'3 entries within 1 minute',archaeologist:'Logged a 30+ day old expense',cat_king:'One category with spending for 30 days straight',centurion:'100 total entries'},
                comeback_msgs: ['Welcome back. Your money didn\'t wait, but I did','The prodigal spender returns! Those expenses won\'t log themselves','Good to have you back. Your balance cried while you were gone'],
                today: 'Today', yesterday: 'Yesterday',
                close: 'Close', new_cat_placeholder: 'New category...',
                enter_book_name: 'Please enter book name', book_created: 'Book created',
                book_deleted: 'Book deleted', cannot_delete_current: 'Cannot delete current book',
                book_edit_title: 'Edit Book', book_name_label: 'Book Name', book_new_placeholder: 'New book...',
                book_add: 'Add', book_delete_warn: 'Deleting this book will erase all its records. This cannot be undone.',
                book_delete_confirm_label: 'Type book name to confirm', book_delete_confirm_placeholder: 'Enter book name...',
                book_delete_btn: 'Delete Book',
                toast_updated: 'Updated', toast_recorded: 'Recorded', toast_deleted: 'Deleted',
                toast_switched_to: 'Switched to', toast_avatar_updated: 'Avatar updated', toast_avatar_restored: 'Default avatar restored', toast_nickname_updated: 'Nickname updated',
                avatar_upload: 'Upload Photo', avatar_restore: 'Restore Default', avatar_cancel: 'Cancel',
                toast_restored: 'records restored',
                pro_unlock: 'Pro AI', pro_unlock_short: 'Pro', pro_locked: 'Locked',
                pro_title: 'Pro AI Features', pro_desc: 'Choose an AI provider and enter your API Key to unlock smart conversations',
                pro_placeholder: 'Paste API Key...', pro_save: 'Activate', pro_clear: 'Deactivate',
                pro_provider_label: 'Provider', pro_model_label: 'Model', pro_model_name: 'Model Name',
                pro_error_invalid: 'API Key invalid. Pro disabled. Please reconfigure.',
                pro_error_rate_limit: 'Rate limited. Switched to offline AI. Try another provider in settings.',
                pro_error_failed: 'Connection failed, using offline mode.',
                pro_error_vpn_hint: 'This provider requires VPN in China. Try Qwen instead.',
                pro_error_switch: 'Settings',
                pro_activated: 'Pro AI activated', pro_cleared: 'Pro features deactivated',
                pro_active: 'Active', pro_thinking: 'Thinking...'
            },
            ja: {
                tab_home: 'ホーム', tab_chat: 'AI', tab_stats: '統計', tab_profile: 'マイ',
                profile_title: '帳簿管理', profile_subtitle: '帳簿・予算・設定',
                books_title: '帳簿', books_manage: '帳簿一覧',
                settings_title: '設定', lang_label: '言語', currency_label: '通貨',
                speech_api_label: '音声認識', api_not_set: '未設定', api_set: '設定済み',
                api_key_title: '音声認識設定', api_key_desc: 'ホーム画面モードで音声を使うにはGemini APIキーを入力', api_key_placeholder: 'APIキーを貼り付け...', api_key_save: '保存', api_key_clear: 'クリア',
                theme_label: 'ダークモード', data_label: 'データ管理', data_clear: '全データ削除',
                confirm_clear: '全データを削除しますか？元に戻せません！',
                greeting_morning: 'おはようございます', greeting_afternoon: 'こんにちは', greeting_evening: 'こんばんは',
                month_expense: '今月の支出', month_income: '収入', net: '収支',
                recent_bills: '最近の明細', no_records: '記録なし', no_records_hint: '最初の記録を始めよう', load_more: 'もっと見る',
                add_tx: '追加', budget_btn: '予算', expense_cal_btn: '支出カレンダー',
                income: '収入', expense: '支出', all: 'すべて',
                trend_title: '収支推移', cat_title: 'カテゴリ',
                export_btn: 'エクスポート', ai_title: 'AI記帳アシスタント',
                ai_subtitle: '音声やテキストで記帳・照会・編集・削除',
                ai_welcome: 'Hi～AI家計簿へようこそ', ai_intro: 'あなたのAI家計簿アシスタントです',
                ai_guide: 'こう言ってみて：\n\n　<i data-lucide="coffee" class="w-3.5 h-3.5 inline-block text-white/40"></i> "スタバ 38"\n　<i data-lucide="car" class="w-3.5 h-3.5 inline-block text-white/40"></i> "タクシー 18.8"\n　<i data-lucide="search" class="w-3.5 h-3.5 inline-block text-white/40"></i> "今月の食費いくら"\n　<i data-lucide="bar-chart-3" class="w-3.5 h-3.5 inline-block text-white/40"></i> "まとめ" でレポート\n　<i data-lucide="trending-up" class="w-3.5 h-3.5 inline-block text-white/40"></i> "予測" で月末予想',
                summary_btn: '月次まとめ', input_placeholder: '入力...',
                cat_manage: 'カテゴリ管理', export_short: 'エクスポート',
                filter_month: '今月', filter_3m: '3ヶ月', filter_6m: '半年',
                filter_year: '1年', filter_all: '全部', filter_custom: '範囲',
                filter_time: '期間を選択', cancel: 'キャンセル', confirm: '確認',
                by_month: '月別', by_year: '年別', by_day: '日別', by_range: '範囲',
                start: '開始', end: '終了',
                all_cats: 'カテゴリ', all_types: '収支', all_expense: '支出', all_income: '収入',
                this_month: '今月', select_cat: 'カテゴリ選択',
                modal_add: '新規追加', modal_edit: '編集',
                cat_label: 'カテゴリ', date_label: '日付', note_label: 'メモ',
                manage: '管理', delete: '削除',
                stats_title: '収支統計',
                book_daily: '日常', book_travel: '旅行', book_family: '家庭',
                book_business: 'ビジネス', book_reimburse: '経費', book_company: '会社', book_team: 'チーム',
                cat_food: '食費', cat_transport: '交通', cat_shopping: '買い物', cat_tech: 'ゲーム',
                cat_utilities: '生活', cat_entertainment: '娯楽', cat_other: 'その他',
                cat_salary: '給料', cat_bonus: 'ボーナス', cat_investment: '資産運用', cat_other_in: 'その他',
                total_budget: '総予算', save: '保存', add: '追加',
                budget_title: '予算設定', budget_stats: '予算', monthly_budget: '月間予算',
                cat_budget: 'カテゴリ予算（任意）', amount_placeholder: '金額',
                new_book: '新しい帳簿名...', note_placeholder: 'メモを入力...',
                no_stats_data: 'データなし', expense_section: '支出カテゴリ', income_section: '収入カテゴリ',
                no_budget_yet: '予算未設定', please_select_cat: 'カテゴリを選択してください',
                please_enter_amount: '有効な金額を入力してください',
                budget_set_toast: '予算を設定:', budget_removed_toast: '予算を削除しました',
                total_budget_set: '総予算を設定:', total_budget_cleared: '総予算をクリアしました',
                budget_used: '使用済', budget_remain: '残り', budget_overspent: '超過',
                budget_over: '予算超過', budget_warning: '残り', budget_unlimited: '無制限',
                voice_listening: '聞いています...',
                enter_amount: '金額を入力', enter_note: 'メモを入力',
                added_cat: 'カテゴリ追加', removed_cat: 'カテゴリ削除',
                max_cats: '最大15カテゴリ', enter_cat_name: 'カテゴリ名を入力',
                level_title: 'レベル進捗', level_current: '現在', level_streak: '継続日数', level_total_tx: '合計記録数', level_budget_hits: '予算達成', level_route: 'レベルの道のり', level_achievements: '獲得した実績', level_achievement_unlock: '隠し実績を解除！', level_req: (days, tx, hits) => `${days}日継続 · ${tx}件 · 予算達成${hits}回`,
                edit_cat: 'カテゴリ編集', tap_change_icon: 'タップでアイコン変更', cat_created: (name) => `「${name}」カテゴリを作成`, cat_learned: (desc, label) => `学習済み：「${desc}」→ ${label}`, level_up: (title) => `▲ レベルアップ！「${title}」に昇格`,
                level_names: ['コイン散落者','帳簿見習い','支出探偵','小数点ハンター','予算弟子','貯金箱の番人','周期観測員','消費断捨離','記帳連撃王','予算調教師','ダンジョン攻略者','数字感知師','衝動抑制者','財務結界術士','資産鍛造匠','複利覚醒者','不労所得ハンター','消費禅修者','財務自由人','金融覚醒者','経済永久機関'],
                level_descs: ['ポケットに穴が','初めて記録を開いた','全ての支出を追跡','端数も見逃さない','欲望に線を引いた','月末にやっと残高が','月中症候群を発見','買い物アプリ3つ削除','記帳速度が消費を超えた','欲望に手綱をつけた','初の月間目標達成','一目で高いか分かる','カート→お気に入りへ','無駄遣いをブロック','一円に居場所がある','時間の価値を理解し始めた','寝てる間もお金が動く','使っても使わなくても自在','お金があなたのために働く','富は副産物に過ぎない','システムが自走している'],
                ach_names: {first_blood:'ファーストブラッド',triple:'七連撃',streak3:'三日の約束',budget_set:'ラインメーカー',ten_records:'形になってきた',night_owl:'深夜のエコノミスト',big_day:'大当たりの日',zero_spend:'断捨離',all_round:'精密射撃',round_lover:'きっちり症候群',early_bird:'タイムマネジャー',speed_run:'スピード記録',archaeologist:'考古学者',cat_king:'カテゴリの王',centurion:'百記録達成'},
                ach_descs: {first_blood:'初めての記録',triple:'累計7件記録',streak3:'3日間連続記録',budget_set:'初めて予算を設定',ten_records:'累計10件記録',night_owl:'深夜2-5時に記録した',big_day:'1件で10,000以上の収入',zero_spend:'7日間連続で支出ゼロ',all_round:'月間予算消化率95%-105%',round_lover:'連続20件がすべて整数',early_bird:'7日間同じ時間帯に記録',speed_run:'1分以内に3件記録',archaeologist:'30日以上前の支出を記録',cat_king:'あるカテゴリで30日連続支出',centurion:'累計100件記録'},
                comeback_msgs: ['おかえり。お金は待ってくれないけど、僕は待ってたよ','帰還確認！留守中の支出、勝手に記録されないからね','戻ってきてくれてよかった。残高が泣いてたよ'],
                today: '今日', yesterday: '昨日',
                close: '閉じる', new_cat_placeholder: '新しいカテゴリ...',
                enter_book_name: '帳簿名を入力', book_created: '帳簿を作成',
                book_deleted: '帳簿を削除', cannot_delete_current: '使用中の帳簿は削除できません',
                book_edit_title: '帳簿を編集', book_name_label: '帳簿名', book_new_placeholder: '新しい帳簿...',
                book_add: '追加', book_delete_warn: '帳簿を削除すると全記録が消えます。元に戻せません。',
                book_delete_confirm_label: '帳簿名を入力して確認', book_delete_confirm_placeholder: '帳簿名を入力...',
                book_delete_btn: '帳簿を削除',
                toast_updated: '更新しました', toast_recorded: '記録しました', toast_deleted: '削除しました',
                toast_switched_to: '切り替え:', toast_avatar_updated: 'アイコンを更新しました', toast_avatar_restored: 'デフォルトアイコンに戻しました', toast_nickname_updated: 'ニックネームを更新しました',
                avatar_upload: '写真をアップロード', avatar_restore: 'デフォルトに戻す', avatar_cancel: 'キャンセル',
                toast_restored: '件復元しました',
                pro_unlock: 'Pro AI機能', pro_unlock_short: 'Pro', pro_locked: '未開放',
                pro_title: 'Pro AI機能', pro_desc: 'AIプロバイダーを選択してAPI Keyを入力すると、スマート会話が使えます',
                pro_placeholder: 'APIキーを貼り付け...', pro_save: '有効化', pro_clear: '無効化',
                pro_provider_label: 'プロバイダー', pro_model_label: 'モデル', pro_model_name: 'モデル名',
                pro_error_invalid: 'API Key無効。Proを無効化しました。再設定してください。',
                pro_error_rate_limit: 'レート制限。オフラインAIに切替済。設定で別プロバイダーをお試しください。',
                pro_error_failed: '接続失敗、オフラインモードで回答。',
                pro_error_vpn_hint: 'このサービスは中国からVPNが必要です。通義千問を推奨。',
                pro_error_switch: '設定変更',
                pro_activated: 'Pro AIを有効化しました', pro_cleared: 'Pro機能を無効化しました',
                pro_active: '有効', pro_thinking: '考え中...'
            },
            ko: {
                tab_home: '홈', tab_chat: 'AI', tab_stats: '통계', tab_profile: '내정보',
                profile_title: '가계부 관리', profile_subtitle: '가계부, 예산, 설정',
                books_title: '내 가계부', books_manage: '내 가계부',
                settings_title: '설정', lang_label: '언어', currency_label: '통화',
                speech_api_label: '음성인식', api_not_set: '미설정', api_set: '설정됨',
                api_key_title: '음성인식 설정', api_key_desc: '홈 화면 모드에서 음성을 사용하려면 Gemini API Key를 입력하세요', api_key_placeholder: 'API Key 붙여넣기...', api_key_save: '저장', api_key_clear: '지우기',
                theme_label: '다크 모드', data_label: '데이터 관리', data_clear: '모든 데이터 삭제',
                confirm_clear: '모든 데이터를 삭제하시겠습니까? 복구할 수 없습니다!',
                greeting_morning: '좋은 아침', greeting_afternoon: '좋은 오후', greeting_evening: '좋은 저녁',
                month_expense: '이달 지출', month_income: '수입', net: '순수지',
                recent_bills: '최근 내역', no_records: '기록 없음', no_records_hint: '첫 기록을 시작하세요', load_more: '더 보기',
                add_tx: '추가', budget_btn: '예산', expense_cal_btn: '지출 달력',
                income: '수입', expense: '지출', all: '전체',
                trend_title: '수지 추이', cat_title: '카테고리',
                export_btn: '내보내기', ai_title: 'AI 가계부 도우미',
                ai_subtitle: '음성이나 텍스트로 기록·조회·수정·삭제',
                ai_welcome: 'Hi～AI 가계부에 오신 것을 환영합니다', ai_intro: '저는 당신의 AI 가계부 도우미입니다',
                ai_guide: '이렇게 말해보세요:\n\n　<i data-lucide="coffee" class="w-3.5 h-3.5 inline-block text-white/40"></i> "스타벅스 38"\n　<i data-lucide="car" class="w-3.5 h-3.5 inline-block text-white/40"></i> "택시 18.8"\n　<i data-lucide="search" class="w-3.5 h-3.5 inline-block text-white/40"></i> "이번 달 식비 얼마"\n　<i data-lucide="bar-chart-3" class="w-3.5 h-3.5 inline-block text-white/40"></i> "요약" 월간 보고서\n　<i data-lucide="trending-up" class="w-3.5 h-3.5 inline-block text-white/40"></i> "예측" 월말 예상',
                summary_btn: '월간 요약', input_placeholder: '입력...',
                cat_manage: '카테고리 관리', export_short: '내보내기',
                filter_month: '이번달', filter_3m: '3개월', filter_6m: '6개월',
                filter_year: '1년', filter_all: '전체', filter_custom: '범위',
                filter_time: '기간 선택', cancel: '취소', confirm: '확인',
                by_month: '월별', by_year: '연별', by_day: '일별', by_range: '범위',
                start: '시작', end: '종료',
                all_cats: '카테고리', all_types: '수지', all_expense: '지출', all_income: '수입',
                this_month: '이번달', select_cat: '카테고리 선택',
                modal_add: '새 기록', modal_edit: '수정',
                cat_label: '카테고리', date_label: '날짜', note_label: '메모',
                manage: '관리', delete: '삭제',
                stats_title: '수지 통계',
                book_daily: '일상', book_travel: '여행', book_family: '가정',
                book_business: '사업', book_reimburse: '경비', book_company: '회사', book_team: '팀',
                cat_food: '식비', cat_transport: '교통', cat_shopping: '쇼핑', cat_tech: '게임',
                cat_utilities: '생활', cat_entertainment: '여가', cat_other: '기타',
                cat_salary: '급여', cat_bonus: '보너스', cat_investment: '재테크', cat_other_in: '기타',
                total_budget: '총 예산', save: '저장', add: '추가',
                budget_title: '예산 설정', budget_stats: '예산', monthly_budget: '월 예산',
                cat_budget: '카테고리 예산 (선택)', amount_placeholder: '금액',
                new_book: '새 가계부 이름...', note_placeholder: '메모 입력...',
                no_stats_data: '데이터 없음', expense_section: '지출 카테고리', income_section: '수입 카테고리',
                no_budget_yet: '예산 미설정', please_select_cat: '카테고리를 선택하세요',
                please_enter_amount: '유효한 금액을 입력하세요',
                budget_set_toast: '예산 설정:', budget_removed_toast: '예산 삭제됨',
                total_budget_set: '총 예산 설정:', total_budget_cleared: '총 예산 삭제됨',
                budget_used: '사용', budget_remain: '잔여', budget_overspent: '초과',
                budget_over: '예산 초과', budget_warning: '잔여', budget_unlimited: '무제한',
                voice_listening: '듣고 있어요...',
                enter_amount: '금액을 입력하세요', enter_note: '메모를 입력하세요',
                added_cat: '카테고리 추가됨', removed_cat: '카테고리 삭제됨',
                max_cats: '최대 15개 카테고리', enter_cat_name: '카테고리 이름을 입력하세요',
                level_title: '레벨 현황', level_current: '현재', level_streak: '연속 일수', level_total_tx: '총 기록 수', level_budget_hits: '예산 달성', level_route: '레벨 경로', level_achievements: '획득한 업적', level_achievement_unlock: '히든 업적 달성!', level_req: (days, tx, hits) => `${days}일 연속 · ${tx}건 · 예산 달성 ${hits}회`,
                edit_cat: '카테고리 편집', tap_change_icon: '탭하여 아이콘 변경', cat_created: (name) => `"${name}" 카테고리 생성됨`, cat_learned: (desc, label) => `학습 완료: "${desc}" → ${label}`, level_up: (title) => `▲ 레벨 업! "${title}" 달성`,
                level_names: ['동전 흘리개','가계부 견습생','지출 탐정','소수점 사냥꾼','예산 견습생','저금통 수호자','주기 관측원','소비 단절자','기록 연타왕','예산 조련사','던전 클리어','숫자 감지사','충동 억제자','재무 결계사','자산 대장장이','복리 각성자','패시브 인컴 헌터','소비 명상가','재정 자유인','금융 각성자','경제 영구기관'],
                level_descs: ['주머니에 구멍이','처음으로 기록을 열다','모든 지출을 추적 중','소수점까지 놓치지 않아','욕망에 선을 그었다','월말에 드디어 잔고가','월중 증후군 발견','쇼핑앱 3개 삭제','기록 속도가 소비를 넘었다','욕망에 고삐를 채웠다','첫 월간 목표 달성','한눈에 비싼지 안다','장바구니→위시리스트로','쓸데없는 소비 차단됨','모든 돈에 자리가 있다','시간의 가격을 이해하기 시작','자는 동안에도 돈이 움직여','쓰든 안 쓰든 자유로워','돈이 당신을 위해 일한다','부는 부산물일 뿐','시스템이 스스로 돌아간다'],
                ach_names: {first_blood:'첫 기록',triple:'세븐 히트',streak3:'3일의 약속',budget_set:'라인 드로어',ten_records:'자리잡기',night_owl:'새벽 이코노미스트',big_day:'대박 수입',zero_spend:'미니멀리스트',all_round:'정밀 타격',round_lover:'강박증 확진',early_bird:'시간 관리자',speed_run:'번개 기록',archaeologist:'고고학자',cat_king:'카테고리 왕',centurion:'백 기록 달성'},
                ach_descs: {first_blood:'첫 번째 기록',triple:'누적 7건 기록',streak3:'3일 연속 기록',budget_set:'처음으로 예산 설정',ten_records:'누적 10건 기록',night_owl:'새벽 2-5시에 기록함',big_day:'단일 수입 10,000 이상',zero_spend:'7일 연속 지출 제로',all_round:'월 예산 사용률 95%-105%',round_lover:'연속 20건 모두 정수 금액',early_bird:'7일 연속 같은 시간에 기록',speed_run:'1분 안에 3건 기록',archaeologist:'30일 이전 지출 기록',cat_king:'한 카테고리 30일 연속 지출',centurion:'누적 100건 기록'},
                comeback_msgs: ['다시 오셨군요. 돈은 안 기다렸지만 저는 기다렸어요','실종자 귀환! 며칠간 쓴 돈, 알아서 기록 안 돼요','돌아와줘서 다행. 잔액이 많이 울었어요'],
                today: '오늘', yesterday: '어제',
                close: '닫기', new_cat_placeholder: '새 카테고리...',
                enter_book_name: '가계부 이름을 입력하세요', book_created: '가계부 생성됨',
                book_deleted: '가계부 삭제됨', cannot_delete_current: '현재 가계부는 삭제할 수 없습니다',
                book_edit_title: '가계부 편집', book_name_label: '가계부 이름', book_new_placeholder: '새 가계부...',
                book_add: '추가', book_delete_warn: '가계부를 삭제하면 모든 기록이 삭제됩니다. 되돌릴 수 없습니다.',
                book_delete_confirm_label: '가계부 이름을 입력하여 확인', book_delete_confirm_placeholder: '가계부 이름 입력...',
                book_delete_btn: '가계부 삭제',
                toast_updated: '업데이트됨', toast_recorded: '기록됨', toast_deleted: '삭제됨',
                toast_switched_to: '전환:', toast_avatar_updated: '아바타 업데이트됨', toast_avatar_restored: '기본 아바타로 복원됨', toast_nickname_updated: '닉네임 업데이트됨',
                avatar_upload: '사진 업로드', avatar_restore: '기본으로 복원', avatar_cancel: '취소',
                toast_restored: '건 복원됨',
                pro_unlock: 'Pro AI', pro_unlock_short: 'Pro', pro_locked: '잠금',
                pro_title: 'Pro AI 기능', pro_desc: 'AI 제공업체를 선택하고 API Key를 입력하면 스마트 대화를 사용할 수 있습니다',
                pro_placeholder: 'API Key 붙여넣기...', pro_save: '활성화', pro_clear: '비활성화',
                pro_provider_label: '공급자', pro_model_label: '모델', pro_model_name: '모델명',
                pro_error_invalid: 'API Key가 유효하지 않습니다. Pro가 비활성화되었습니다.',
                pro_error_rate_limit: '속도 제한. 오프라인 AI로 전환됨. 설정에서 다른 공급자를 시도하세요.',
                pro_error_failed: '연결 실패, 오프라인 모드로 응답.',
                pro_error_vpn_hint: '이 서비스는 중국에서 VPN이 필요합니다. Qwen 추천.',
                pro_error_switch: '설정 변경',
                pro_activated: 'Pro AI 활성화됨', pro_cleared: 'Pro 기능 비활성화됨',
                pro_active: '활성', pro_thinking: '생각 중...'
            }
        };

        function t(key) { return (i18n[currentLang] || i18n.zh)[key] || i18n.zh[key] || ''; }

        const LANG_OPTIONS = [
            { code: 'zh', label: '中文', desc: '简体中文' },
            { code: 'en', label: 'English', desc: 'English' },
            { code: 'ja', label: '日本語', desc: 'Japanese' },
            { code: 'ko', label: '한국어', desc: 'Korean' }
        ];

        function switchLang(lang) {
            currentLang = lang;
            nfStorage.setItem('lang', lang);
            applyI18n();
            renderAll();
            renderBookSelector();
            chatWelcomed = false;
            const chatBox = document.getElementById('chat-box');
            if (chatBox) chatBox.innerHTML = '';
            closeLangPanel();
        }

        function openLangPanel() {
            const container = document.getElementById('lang-list');
            container.innerHTML = LANG_OPTIONS.map(opt => `
                <div onclick="switchLang('${opt.code}')" class="flex items-center justify-between px-4 py-3.5 rounded-[12px] ${opt.code === currentLang ? 'bg-cyber-purple/10' : ''} active:bg-white/5 transition-colors cursor-pointer">
                    <span class="text-[15px] ${opt.code === currentLang ? 'text-white font-medium' : 'text-white/80'}">${opt.label}</span>
                    ${opt.code === currentLang ? '<i data-lucide="check" class="w-4.5 h-4.5 text-cyber-purple"></i>' : ''}
                </div>
            `).join('');
            document.getElementById('lang-modal').classList.remove('hidden');
            lucide.createIcons();
        }

        function closeLangPanel() {
            document.getElementById('lang-modal').classList.add('hidden');
        }


        function applyI18n() {
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                const val = t(key);
                if (val) el.textContent = val;
            });
            document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                const val = t(key);
                if (val) el.placeholder = val;
            });
            const langLabel = document.getElementById('current-lang-label');
            if (langLabel) {
                const opt = LANG_OPTIONS.find(o => o.code === currentLang);
                langLabel.textContent = opt ? opt.label : '';
            }
            const chatInput = document.getElementById('chat-input');
            if (chatInput) chatInput.placeholder = t('input_placeholder');
            const greetEl = document.getElementById('greeting-text');
            if (greetEl) {
                const h = new Date().getHours();
                const key = h < 12 ? 'greeting_morning' : h < 18 ? 'greeting_afternoon' : 'greeting_evening';
                const ld = getLevelData();
                greetEl.textContent = `${t(key)} · ${lvlTitle(ld.level)}`;
            }
            const profileBadge = document.getElementById('profile-level-badge');
            if (profileBadge) {
                const ld2 = getLevelData();
                const lvl2 = LEVELS[ld2.level] || LEVELS[0];
                profileBadge.innerHTML = `<span style="background:linear-gradient(135deg,#c084fc,#818cf8,#67e8f9);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:500">Lv.${ld2.level}</span> <span style="background:linear-gradient(135deg,#e9d5ff,#c4b5fd,#a5b4fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:500">${lvlTitle(ld2.level)}</span> <i data-lucide="flame" class="w-[16px] h-[16px] inline-block" style="color:#f97316;fill:#fb923c;"></i><span class="text-orange-400 font-num">${ld2.streak}</span>`;
                lucide.createIcons();
            }
            const streakEl = document.getElementById('streak-count');
            if (streakEl) {
                const ld3 = getLevelData();
                streakEl.textContent = ld3.streak || 0;
            }

            // Date filter modal
            const dfTitle = document.querySelector('#date-filter-modal h3');
            if (dfTitle) dfTitle.textContent = t('filter_time');
            const dfConfirm = document.getElementById('df-confirm-btn');
            if (dfConfirm) dfConfirm.textContent = t('confirm');
            const dfMonth = document.getElementById('df-tab-month');
            if (dfMonth) dfMonth.textContent = t('by_month');
            const dfYear = document.getElementById('df-tab-year');
            if (dfYear) dfYear.textContent = t('by_year');
            const dfDay = document.getElementById('df-tab-day');
            if (dfDay) dfDay.textContent = t('by_day');
            const dfRange = document.getElementById('df-tab-range');
            if (dfRange) dfRange.textContent = t('by_range');

            // Home filters - update labels when they show default values
            const labelDate = document.getElementById('label-date');
            if (labelDate) {
                const dateDefaults = ['本月', 'Mon.', 'This Month', '今月', '이번달'];
                if (dateDefaults.includes(labelDate.textContent) || labelDate.textContent === t('this_month')) labelDate.textContent = t('this_month');
            }
            const labelCat = document.getElementById('label-cat');
            if (labelCat && listFilterCat === 'all') labelCat.textContent = t('all_cats');
            const labelType = document.getElementById('label-type');
            if (labelType && listFilterType === 'all') labelType.textContent = t('all_types');

            // Edit modal
            const btnExpense = document.getElementById('btn-expense');
            if (btnExpense) btnExpense.textContent = t('expense');
            const btnIncome = document.getElementById('btn-income');
            if (btnIncome) btnIncome.textContent = t('income');

            // Select category modal title
            const catModalTitle = document.querySelector('#filter-cat-modal h3');
            if (catModalTitle) catModalTitle.textContent = t('select_cat');

            // Budget modal
            const budgetTitle = document.querySelector('#budget-modal h3');
            if (budgetTitle) budgetTitle.textContent = t('budget_title');

            // Book name (e.g. "日常" → "Daily")
            renderBookSelector();
        }


        // --- Avatar & Profile Name ---
        let DEFAULT_AVATAR_SRC = '';
        function showAvatarActions() {
            document.getElementById('avatar-action-modal').classList.remove('hidden');
        }
        function closeAvatarActions() {
            document.getElementById('avatar-action-modal').classList.add('hidden');
        }
        function resetAvatar() {
            nfStorage.removeItem('avatar');
            const img = document.getElementById('avatar-img');
            img.src = DEFAULT_AVATAR_SRC;
            const cardAvatar = document.getElementById('card-avatar');
            if (cardAvatar) cardAvatar.src = DEFAULT_AVATAR_SRC;
            closeAvatarActions();
            showToast(t('toast_avatar_restored'));
        }
        function handleAvatarUpload(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(ev) {
                const dataUrl = ev.target.result;
                nfStorage.setItem('avatar', dataUrl);
                applyAvatar();
                showToast(t('toast_avatar_updated'));
            };
            reader.readAsDataURL(file);
        }
        function applyAvatar() {
            const saved = nfStorage.getItem('avatar');
            const img = document.getElementById('avatar-img');
            const txt = document.getElementById('avatar-text');
            if (saved) {
                img.src = saved;
            }
            img.classList.remove('hidden');
            txt.classList.add('hidden');
            const cardAvatar = document.getElementById('card-avatar');
            if (cardAvatar) cardAvatar.src = saved || img.src;
            const name = nfStorage.getItem('profile_name') || 'Master';
            document.getElementById('profile-name').textContent = name;
            const cardName = document.getElementById('card-username');
            if (cardName) cardName.textContent = name;
        }
        function editProfileName() {
            const current = nfStorage.getItem('profile_name') || 'Master';
            document.getElementById('name-input').value = current;
            document.getElementById('name-modal').classList.remove('hidden');
        }
        function saveProfileName() {
            const newName = document.getElementById('name-input').value.trim();
            if (newName) {
                nfStorage.setItem('profile_name', newName);
                document.getElementById('profile-name').textContent = newName;
                const cardName = document.getElementById('card-username');
                if (cardName) cardName.textContent = newName;
                showToast(t('toast_nickname_updated'));
            }
            closeNameModal();
        }
        function closeNameModal() {
            document.getElementById('name-modal').classList.add('hidden');
        }

        function saveBudgets() { nfStorage.setItem(getBudgetKey(), JSON.stringify(budgets)); }
        function saveShortcuts() { nfStorage.setItem('shortcuts', JSON.stringify(shortcuts)); }

        function checkAndApplyRecurring() {
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            recurringTxs.forEach(r => {
                let shouldAdd = false;
                if (r.freq === 'monthly') {
                    const targetDay = r.day || 1;
                    if (now.getDate() === targetDay) {
                        const key = `${r.id}_${now.getFullYear()}_${now.getMonth()}`;
                        if (!nfStorage.getItem(key)) { shouldAdd = true; nfStorage.setItem(key, '1'); }
                    }
                } else if (r.freq === 'weekly') {
                    const dayOfWeek = now.getDay() || 7;
                    if (dayOfWeek === (r.dayOfWeek || 1)) {
                        const weekNum = Math.floor((now - new Date(now.getFullYear(),0,1)) / (7*24*60*60*1000));
                        const key = `${r.id}_${now.getFullYear()}_w${weekNum}`;
                        if (!nfStorage.getItem(key)) { shouldAdd = true; nfStorage.setItem(key, '1'); }
                    }
                } else if (r.freq === 'daily') {
                    const key = `${r.id}_${todayStr}`;
                    if (!nfStorage.getItem(key)) { shouldAdd = true; nfStorage.setItem(key, '1'); }
                }
                if (shouldAdd) {
                    const bookId = r.bookId || 'default';
                    const txKey = `txs_${bookId}`;
                    const bookTxs = bookId === currentBook ? txs : JSON.parse(nfStorage.getItem(txKey) || '[]');
                    bookTxs.push({ id: Date.now() + Math.floor(Math.random() * 10000), date: now.toISOString(), desc: r.desc, amount: r.amount, cat: r.cat, type: r.type });
                    if (bookId !== currentBook) {
                        nfStorage.setItem(txKey, JSON.stringify(bookTxs));
                    }
                }
            });
        }

        function initializeApp() {
            DEFAULT_AVATAR_SRC = document.getElementById('avatar-img').src;
            lucide.createIcons();
            initSpeech();
            checkAndApplyRecurring();
            initDatePicker();
            applyI18n();
            applyAvatar();
            updateApiKeyStatus();
            if (amountHidden) {
                const btn = document.getElementById('eye-toggle');
                btn.innerHTML = '<i data-lucide="eye-off" class="w-3.5 h-3.5"></i>';
                lucide.createIcons({attrs: {class: ''}, nameAttr: 'data-lucide'});
            }
            renderBookSelector();
            renderAll();

            document.getElementById('transaction-list').addEventListener('click', e => {
                const wrapper = e.target.closest('.tx-swipe-wrapper');
                if (wrapper && wrapper.classList.contains('swiped') && !e.target.closest('.tx-swipe-actions')) {
                    wrapper.classList.remove('swiped');
                }
            });

            // Level system: check streak on load
            const _streakData = checkStreak();
            const _streakEl = document.getElementById('streak-count');
            if (_streakEl) _streakEl.textContent = _streakData.streak || 0;
            if (_streakData._comeback) {
                const _cbMsgs = getComebackMsgs();
                const _cbMsg = _cbMsgs[Math.floor(Math.random() * _cbMsgs.length)];
                setTimeout(() => showToast(_cbMsg, 'info'), 800);
                _streakData._comeback = false;
                saveLevelData(_streakData);
            }

            // 智能提问：检测几天没记账
            const lastTxDate = txs.length > 0 ? new Date(Math.max(...txs.map(t => new Date(t.date).getTime()))) : null;
            if (lastTxDate) {
                const gapDays = Math.floor((Date.now() - lastTxDate.getTime()) / 86400000);
                if (gapDays >= 2 && gapDays < 7) {
                    const nudges = {
                        zh: [`${gapDays}天没记账了，这几天花的钱要不要补一下？`, `好久不见！最近${gapDays}天的消费记一下？`],
                        en: [`${gapDays} days without logging. Want to catch up?`, `Haven't seen you in ${gapDays} days. Any expenses to add?`],
                        ja: [`${gapDays}日間記録なし。まとめて記入する？`, `${gapDays}日ぶり！最近の支出を記録する？`],
                        ko: [`${gapDays}일간 기록 없음. 모아서 기록할까요?`, `${gapDays}일 만이에요! 최근 지출 기록할까요?`],
                    };
                    const msgs = nudges[currentLang] || nudges.zh;
                    setTimeout(() => showToast(msgs[Math.floor(Math.random() * msgs.length)], 'info'), 1500);
                }
            }

            const savedCount = txs.length;
            if (savedCount > 0) {
                showToast(`${savedCount} ${t('toast_restored')}`, 'info');
            }
            initSwipeToDismiss();

            // PWA切回前台时刷新streak
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    const sd = checkStreak();
                    const se = document.getElementById('streak-count');
                    if (se) se.textContent = sd.streak || 0;
                }
            });
        };

        function initSwipeToDismiss() {
            const modalMap = [
                { id: 'date-filter-modal', close: closeDateFilterModal },
                { id: 'filter-cat-modal', close: closeFilterCatModal },
                { id: 'edit-modal', close: closeEditModal },
                { id: 'lang-modal', close: closeLangPanel },
                { id: 'book-modal', close: closeBookManager },
                { id: 'book-edit-modal', close: closeBookEdit },
                { id: 'avatar-action-modal', close: closeAvatarActions },
                { id: 'name-modal', close: closeNameModal },
                { id: 'budget-modal', close: closeBudgetModal },
                { id: 'category-modal', close: closeCategoryManager },
            ];
            modalMap.forEach(({ id, close }) => {
                const modal = document.getElementById(id);
                if (!modal) return;
                const sheet = modal.querySelector('.absolute.bottom-0');
                if (!sheet) return;
                let startY = 0, currentY = 0, dragging = false;
                sheet.addEventListener('touchstart', e => {
                    if (e.target.closest('.scroll-picker-list, .scroll-picker')) return;
                    const t = e.target.closest('.overflow-y-auto, .no-scrollbar');
                    if (t && t.scrollTop > 0) return;
                    startY = e.touches[0].clientY;
                    currentY = startY;
                    dragging = true;
                    sheet.style.transition = 'none';
                }, { passive: true });
                sheet.addEventListener('touchmove', e => {
                    if (!dragging) return;
                    currentY = e.touches[0].clientY;
                    const dy = currentY - startY;
                    if (dy > 0) {
                        sheet.style.transform = `translateY(${dy}px)`;
                    }
                }, { passive: true });
                sheet.addEventListener('touchend', () => {
                    if (!dragging) return;
                    dragging = false;
                    const dy = currentY - startY;
                    sheet.style.transition = 'transform 0.3s ease';
                    if (dy > 80) {
                        sheet.style.transform = `translateY(100%)`;
                        setTimeout(() => { close(); sheet.style.transform = ''; }, 300);
                    } else {
                        sheet.style.transform = '';
                    }
                });
            });
        }

        function initDatePicker() {
            const ids = [
                'sp-month-year','sp-month-month','sp-year',
                'sp-day-year','sp-day-month','sp-day-day',
                'sp-rs-year','sp-rs-month','sp-rs-day',
                'sp-re-year','sp-re-month','sp-re-day'
            ];
            const now = new Date();
            const cy = now.getFullYear();
            const years = [];
            for (let i = cy - 5; i <= cy; i++) years.push(i);
            const months = [];
            for (let i = 1; i <= 12; i++) months.push(i);
            const days = [];
            for (let i = 1; i <= 31; i++) days.push(i);

            const config = {
                'sp-month-year': years, 'sp-month-month': months,
                'sp-year': years,
                'sp-day-year': years, 'sp-day-month': months, 'sp-day-day': days,
                'sp-rs-year': years, 'sp-rs-month': months, 'sp-rs-day': days,
                'sp-re-year': years, 'sp-re-month': months, 'sp-re-day': days
            };

            ids.forEach(id => {
                const container = document.getElementById(id);
                if (!container) return;
                const listEl = container.querySelector('.scroll-picker-list');
                if (listEl.children.length > 0) return;
                const vals = config[id];
                vals.forEach(v => {
                    const div = document.createElement('div');
                    div.className = 'scroll-picker-item';
                    div.dataset.value = v;
                    div.textContent = String(v);
                    listEl.appendChild(div);
                });
            });

            _bindPickerHide('day', 'sp-day-year', 'sp-day-month', 'sp-day-day');
            _bindPickerHide('rs', 'sp-rs-year', 'sp-rs-month', 'sp-rs-day');
            _bindPickerHide('re', 'sp-re-year', 'sp-re-month', 'sp-re-day');
            _bindPickerHide('mm', 'sp-month-year', 'sp-month-month', null);
        }

        let _pickerBound = {};

        function _bindPickerHide(key, yearId, monthId, dayId) {
            if (_pickerBound[key]) return;
            _pickerBound[key] = true;
            const yList = document.getElementById(yearId).querySelector('.scroll-picker-list');
            const mList = monthId ? document.getElementById(monthId).querySelector('.scroll-picker-list') : null;
            const dList = dayId ? document.getElementById(dayId).querySelector('.scroll-picker-list') : null;
            let t1 = null, t2 = null;
            yList.addEventListener('scroll', () => {
                clearTimeout(t1);
                t1 = setTimeout(() => { _hideFuture(yearId, monthId, dayId); }, 200);
            });
            if (mList) mList.addEventListener('scroll', () => {
                clearTimeout(t2);
                t2 = setTimeout(() => { _hideFuture(yearId, monthId, dayId); }, 200);
            });
        }

        function _hideFuture(yearId, monthId, dayId) {
            const now = new Date();
            const cy = now.getFullYear(), cm = now.getMonth() + 1, cd = now.getDate();
            const selY = getPickerValue(yearId);

            if (monthId) {
                const mList = document.getElementById(monthId).querySelector('.scroll-picker-list');
                Array.from(mList.children).forEach(item => {
                    const v = parseInt(item.dataset.value);
                    item.classList.toggle('picker-hidden', selY === cy && v > cm);
                });
            }

            if (dayId) {
                const selM = monthId ? getPickerValue(monthId) : 1;
                const dList = document.getElementById(dayId).querySelector('.scroll-picker-list');
                const maxDays = new Date(selY, selM, 0).getDate();
                Array.from(dList.children).forEach(item => {
                    const v = parseInt(item.dataset.value);
                    const isFuture = (selY === cy && selM === cm && v > cd);
                    item.classList.toggle('picker-hidden', isFuture || v > maxDays);
                });
            }
        }

        function _scrollPickerTo(containerId, value) {
            const container = document.getElementById(containerId);
            if (!container) return;
            const listEl = container.querySelector('.scroll-picker-list');
            const items = Array.from(listEl.children);
            const idx = items.findIndex(el => !el.classList.contains('picker-hidden') && parseInt(el.dataset.value) === value);
            if (idx >= 0) listEl.scrollTop = idx * 40;
        }

        function clampDate(y, m, d) {
            const now = new Date();
            const maxDays = new Date(y, m, 0).getDate();
            if (d > maxDays) d = maxDays;
            if (y > now.getFullYear()) { y = now.getFullYear(); m = now.getMonth()+1; d = now.getDate(); }
            else if (y === now.getFullYear() && m > now.getMonth()+1) { m = now.getMonth()+1; d = now.getDate(); }
            else if (y === now.getFullYear() && m === now.getMonth()+1 && d > now.getDate()) { d = now.getDate(); }
            return { y, m, d };
        }

        function getPickerValue(containerId) {
            const container = document.getElementById(containerId);
            if (!container) return 1;
            const listEl = container.querySelector('.scroll-picker-list');
            const idx = Math.round(listEl.scrollTop / 40);
            const item = listEl.children[idx];
            if (item && item.classList.contains('picker-hidden')) {
                for (let i = idx - 1; i >= 0; i--) {
                    if (!listEl.children[i].classList.contains('picker-hidden')) {
                        return parseInt(listEl.children[i].dataset.value);
                    }
                }
            }
            return item ? parseInt(item.dataset.value) : 1;
        }

        function toggleAmountVisibility() {
            amountHidden = !amountHidden;
            nfStorage.setItem('amount_hidden', amountHidden);
            const btn = document.getElementById('eye-toggle');
            btn.innerHTML = amountHidden
                ? '<i data-lucide="eye-off" class="w-[18px] h-[18px]"></i>'
                : '<i data-lucide="eye" class="w-[18px] h-[18px]"></i>';
            lucide.createIcons({attrs: {class: ''}, nameAttr: 'data-lucide'});
            renderAll();
        }

        const BOOK_I18N_MAP = { 'default': 'book_daily', 'travel': 'book_travel', 'family': 'book_family', 'business': 'book_business', 'reimburse': 'book_reimburse', 'company': 'book_company', 'team': 'book_team' };
        const BOOK_NAMES = {
            'default': {zh:'日常',en:'Daily',ja:'日常',ko:'일상'},
            'travel': {zh:'旅游',en:'Travel',ja:'旅行',ko:'여행'},
            'family': {zh:'家庭',en:'Family',ja:'家庭',ko:'가정'},
            'business': {zh:'生意',en:'Business',ja:'ビジネス',ko:'비즈니스'},
            'reimburse': {zh:'报销',en:'Reimburse',ja:'経費',ko:'경비'},
            'company': {zh:'公司',en:'Company',ja:'会社',ko:'회사'},
            'team': {zh:'团队',en:'Team',ja:'チーム',ko:'팀'}
        };
        function getBookName(b) {
            if (BOOK_NAMES[b.id]) return BOOK_NAMES[b.id][currentLang] || BOOK_NAMES[b.id].zh;
            return b.name;
        }
        function renderBookSelector() {
            const el = document.getElementById('current-book-name');
            if (el) {
                const book = books.find(b => b.id === currentBook);
                if (book) {
                    const i18nKey = BOOK_I18N_MAP[book.id];
                    el.textContent = (i18nKey && t(i18nKey)) || book.name;
                    el.setAttribute('data-i18n', i18nKey || '');
                } else {
                    el.textContent = '';
                }
            }
        }

        function openBookManager() {
            document.getElementById('book-modal').classList.remove('hidden');
            closeBookIconPicker();
            renderBookList();
        }

        function closeBookManager() {
            document.getElementById('book-modal').classList.add('hidden');
        }

        function renderBookList() {
            const list = document.getElementById('book-list');
            list.innerHTML = books.map(b => {
                const isDefault = DEFAULT_BOOKS.some(d => d.id === b.id);
                const displayName = getBookName(b);
                const isActive = b.id === currentBook;
                return `<div onclick="switchBook('${b.id}');closeBookManager()" class="relative flex items-center gap-3 p-4 rounded-[12px] ${isActive ? 'bg-cyber-purple/10' : 'bg-white/[0.03]'} cursor-pointer active:scale-[0.97] transition-all">
                    <i data-lucide="${b.icon}" class="w-5 h-5 shrink-0" style="color:${b.color}"></i>
                    <span class="text-[14px] font-medium text-white flex-1">${displayName}</span>
                    ${!isDefault ? `<button onclick="event.stopPropagation();openBookEdit('${b.id}')" class="text-white/25 hover:text-white/60 transition-colors"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>` : ''}
                </div>`;
            }).join('');
            lucide.createIcons({attrs: {class: ''}, nameAttr: 'data-lucide'});
        }

        let editingBookId = null;
        let editBookIcon = 'book-open';

        function openBookEdit(id) {
            editingBookId = id;
            const book = books.find(b => b.id === id);
            if (!book) return;
            const isDefault = DEFAULT_BOOKS.some(d => d.id === id);
            const name = getBookName(book);
            editBookIcon = book.icon || 'book-open';
            document.getElementById('edit-book-name-input').value = name;
            const iconPreview = document.getElementById('edit-book-icon-preview');
            if (iconPreview) { iconPreview.setAttribute('data-lucide', editBookIcon); lucide.createIcons(); }
            document.getElementById('delete-book-section').classList.toggle('hidden', isDefault);
            document.getElementById('delete-book-confirm-input').value = '';
            document.getElementById('btn-confirm-delete-book').disabled = true;
            document.getElementById('book-edit-modal').classList.remove('hidden');
        }

        function toggleEditBookIconPicker() {
            const panel = document.getElementById('edit-book-icon-panel');
            if (!panel) return;
            panel.classList.remove('hidden');
            const grid = document.getElementById('edit-book-icon-grid');
            grid.innerHTML = BOOK_ICONS.map(icon => `
                <div onclick="selectEditBookIcon('${icon}')" class="flex items-center justify-center w-12 h-12 rounded-2xl cursor-pointer transition-colors ${icon === editBookIcon ? 'bg-[#7c3aed]' : 'bg-white/5'}">
                    <i data-lucide="${icon}" class="w-6 h-6 ${icon === editBookIcon ? 'text-white' : 'text-white/50'}"></i>
                </div>
            `).join('');
            lucide.createIcons();
        }

        function closeEditBookIconPicker() {
            const panel = document.getElementById('edit-book-icon-panel');
            if (panel) panel.classList.add('hidden');
        }

        function selectEditBookIcon(icon) {
            editBookIcon = icon;
            const preview = document.getElementById('edit-book-icon-preview');
            if (preview) { preview.setAttribute('data-lucide', icon); lucide.createIcons(); }
            closeEditBookIconPicker();
        }
        function closeBookEdit() {
            document.getElementById('book-edit-modal').classList.add('hidden');
            editingBookId = null;
        }
        function useBook() {
            if (editingBookId) {
                switchBook(editingBookId);
                closeBookEdit();
                closeBookManager();
            }
        }
        function saveBookName() {
            const newName = document.getElementById('edit-book-name-input').value.trim();
            if (!newName) return;
            const book = books.find(b => b.id === editingBookId);
            if (book) {
                book.name = newName;
                book.icon = editBookIcon;
                nfStorage.setItem('books', JSON.stringify(books));
                renderBookList();
                renderBookSelector();
                showToast(t('toast_updated'));
            }
            closeBookEdit();
        }
        function checkDeleteBookInput() {
            const book = books.find(b => b.id === editingBookId);
            const name = getBookName(book);
            const input = document.getElementById('delete-book-confirm-input').value.trim();
            document.getElementById('btn-confirm-delete-book').disabled = input !== name;
        }
        function confirmDeleteBook() {
            const book = books.find(b => b.id === editingBookId);
            const name = getBookName(book);
            const input = document.getElementById('delete-book-confirm-input').value.trim();
            if (input !== name) return;
            removeBook(editingBookId);
            closeBookEdit();
        }

        const BOOK_ICONS = ['book-open','wallet','briefcase','shopping-bag','plane','home','heart','car','gamepad-2','music','film','dumbbell','coffee','gift','star','crown','gem','leaf','flower-2','paw-print','baby','graduation-cap','building','store','banknote','trending-up','sparkles','zap'];
        let selectedBookIcon = 'book-open';

        function toggleBookIconPicker() {
            const panel = document.getElementById('book-icon-picker-panel');
            if (!panel) return;
            panel.classList.remove('hidden');
            renderBookIconPicker();
        }

        function closeBookIconPicker() {
            const panel = document.getElementById('book-icon-picker-panel');
            if (panel) panel.classList.add('hidden');
        }

        function renderBookIconPicker() {
            const grid = document.getElementById('book-icon-picker');
            if (!grid) return;
            grid.innerHTML = BOOK_ICONS.map(icon => `
                <div onclick="selectBookIcon('${icon}')" class="flex items-center justify-center w-12 h-12 rounded-2xl cursor-pointer transition-colors ${icon === selectedBookIcon ? 'bg-[#7c3aed]' : 'bg-white/5'}" data-book-icon-key="${icon}">
                    <i data-lucide="${icon}" class="w-6 h-6 ${icon === selectedBookIcon ? 'text-white' : 'text-white/50'}"></i>
                </div>
            `).join('');
            lucide.createIcons();
        }

        function selectBookIcon(icon) {
            selectedBookIcon = icon;
            const preview = document.getElementById('book-icon-preview');
            if (preview) { preview.setAttribute('data-lucide', icon); lucide.createIcons(); }
            closeBookIconPicker();
        }

        function addBook() {
            const name = document.getElementById('new-book-name').value.trim();
            if (!name) { showToast(t('enter_book_name'), 'error'); return; }
            const id = 'book_' + Date.now();
            const firstNonCustomIdx = books.findIndex((b, i) => i > 0 && DEFAULT_BOOKS.some(d => d.id === b.id));
            const insertIdx = firstNonCustomIdx > 0 ? firstNonCustomIdx : books.length;
            books.splice(insertIdx, 0, { id, name, icon: selectedBookIcon, color: PRESET_COLORS[books.length % PRESET_COLORS.length] });
            nfStorage.setItem('books', JSON.stringify(books));
            document.getElementById('new-book-name').value = '';
            selectedBookIcon = 'book-open';
            closeBookIconPicker();
            const bookPreview = document.getElementById('book-icon-preview');
            if (bookPreview) { bookPreview.setAttribute('data-lucide', 'book-open'); lucide.createIcons(); }
            renderBookList();
            renderBookSelector();
            showToast(`${t('book_created')}「${name}」`);
        }

        function removeBook(id) {
            if (id === currentBook) { showToast(t('cannot_delete_current'), 'error'); return; }
            const b = books.find(x => x.id === id);
            books = books.filter(x => x.id !== id);
            nfStorage.setItem('books', JSON.stringify(books));
            nfStorage.removeItem(`txs_${id}`);
            nfStorage.removeItem(`budgets_${id}`);
            nfStorage.removeItem(`total_budget_${id}`);
            recurringTxs = recurringTxs.filter(r => r.bookId !== id);
            nfStorage.setItem('recurringTxs', JSON.stringify(recurringTxs));
            renderBookList();
            renderBookSelector();
            showToast(`${t('book_deleted')}「${b?.name||''}」`);
        }

        function openBudgetModal() {
            document.getElementById('budget-modal').classList.remove('hidden');
            const totalInput = document.getElementById('budget-total-input');
            totalInput.value = totalBudget > 0 ? totalBudget : '';
            renderBudgetList();
            const select = document.getElementById('budget-cat-select');
            select.innerHTML = '';
            Object.entries(EXPENSE_CATS).forEach(([key, val]) => {
                if (!budgets[key]) {
                    select.innerHTML += `<option value="${key}">${t('cat_' + key) || val.label}</option>`;
                }
            });
        }

        function saveTotalBudget() {
            const val = parseFloat(document.getElementById('budget-total-input').value);
            totalBudget = val > 0 ? val : 0;
            nfStorage.setItem(getTotalBudgetKey(), totalBudget);
            if (totalBudget > 0) checkAchievements({ action: 'budget_set' });
            closeBudgetModal();
            renderAll();
            showToast(totalBudget > 0 ? `${t('total_budget_set')} ${totalBudget.toLocaleString()}` : t('total_budget_cleared'));
        }

        function closeBudgetModal() {
            document.getElementById('budget-modal').classList.add('hidden');
        }

        function renderBudgetList() {
            const container = document.getElementById('budget-list');
            const keys = Object.keys(budgets);
            if (keys.length === 0) {
                container.innerHTML = `<p class="text-white/35 text-sm text-center py-6">${t('no_budget_yet')}</p>`;
                return;
            }
            container.innerHTML = keys.map(cat => {
                const catObj = EXPENSE_CATS[cat] || { label: cat, color: '#7c3aed' };
                return `<div class="flex items-center justify-between px-4 py-3 rounded-[12px] bg-white/[0.03] border border-white/5">
                    <div class="flex items-center gap-3">
                        <div class="w-7 h-7 rounded-full flex items-center justify-center" style="background:${catObj.color}15">
                            <i data-lucide="${catObj.icon || 'tag'}" class="w-3.5 h-3.5" style="color:${catObj.color}"></i>
                        </div>
                        <span class="text-sm text-white">${t('cat_' + cat) || catObj.label}</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="text-sm font-num text-white/60">${budgets[cat].toLocaleString()}</span>
                        <button onclick="removeBudget('${cat}')" class="text-white/35 hover:text-red-400 transition-colors">
                            <i data-lucide="x" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>`;
            }).join('');
            lucide.createIcons({attrs: {class: ''}, nameAttr: 'data-lucide'});
        }

        function addBudgetFromModal() {
            const cat = document.getElementById('budget-cat-select').value;
            const amount = parseFloat(document.getElementById('budget-amount-input').value);
            if (!cat) { showToast(t('please_select_cat'), 'error'); return; }
            if (!amount || amount <= 0) { showToast(t('please_enter_amount'), 'error'); return; }
            budgets[cat] = amount;
            nfStorage.setItem(getBudgetKey(), JSON.stringify(budgets));
            document.getElementById('budget-amount-input').value = '';
            const catLabel = t('cat_' + cat) || (EXPENSE_CATS[cat] || {label: cat}).label;
            showToast(`${catLabel} ${t('budget_set_toast')} ${amount.toLocaleString()}`);
            renderBudgetList();
            openBudgetModal();
            renderAll();
        }

        function removeBudget(cat) {
            const catLabel = t('cat_' + cat) || (EXPENSE_CATS[cat] || {label: cat}).label;
            delete budgets[cat];
            nfStorage.setItem(getBudgetKey(), JSON.stringify(budgets));
            showToast(`${catLabel} ${t('budget_removed_toast')}`);
            renderBudgetList();
            openBudgetModal();
            renderAll();
        }

        function generateBillImage(list) {
            const totalExp = list.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
            const totalInc = list.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
            const rowH = 32, headerH = 160, padBottom = 40;
            const w = 750, h = headerH + list.length * rowH + padBottom;
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#0c0c0e';
            ctx.fillRect(0, 0, w, h);

            ctx.fillStyle = '#7c3aed';
            ctx.font = 'bold 28px system-ui';
            ctx.fillText(t('summary_btn'), 40, 50);

            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '14px system-ui';
            ctx.fillText(new Date().toLocaleDateString(), 40, 80);

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 20px system-ui';
            ctx.fillText(`${t('expense')} ${totalExp.toLocaleString()}`, 40, 120);
            ctx.fillStyle = '#10b981';
            ctx.fillText(`${t('income')} ${totalInc.toLocaleString()}`, 300, 120);

            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.beginPath(); ctx.moveTo(40, 140); ctx.lineTo(w - 40, 140); ctx.stroke();

            list.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach((t, i) => {
                const y = headerH + i * rowH;
                const d = new Date(t.date);
                const dateStr = `${d.getMonth()+1}/${d.getDate()}`;
                const catLabel = (t.type === 'income' ? INCOME_CATS : EXPENSE_CATS)[t.cat]?.label || '';
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.font = '13px system-ui';
                ctx.fillText(dateStr, 40, y + 20);
                ctx.fillStyle = 'rgba(255,255,255,0.8)';
                ctx.fillText(t.desc, 120, y + 20);
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText(catLabel, 380, y + 20);
                ctx.fillStyle = t.type === 'income' ? '#10b981' : '#fff';
                ctx.font = 'bold 14px system-ui';
                ctx.textAlign = 'right';
                ctx.fillText(`${t.type==='income'?'+':'-'}${t.amount.toLocaleString()}`, w - 40, y + 20);
                ctx.textAlign = 'left';
            });

            canvas.toBlob(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `bill_${new Date().toISOString().slice(0,10)}.png`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
        }

        function renderBudgetBars() {
            const container = document.getElementById('budget-bars');
            const keys = Object.keys(budgets);
            const hasBudgets = keys.length > 0 || totalBudget > 0;

            let filterStart, filterEnd;
            const mode = dateFilterState.mode;
            if (mode === 'month') {
                const [fy, fm] = (dateFilterState.value || '').split('-').map(Number);
                filterStart = new Date(fy, fm - 1, 1);
                filterEnd = new Date(fy, fm, 0, 23, 59, 59);
            } else if (mode === 'year') {
                const fy = parseInt(dateFilterState.value);
                filterStart = new Date(fy, 0, 1);
                filterEnd = new Date(fy, 11, 31, 23, 59, 59);
            } else if (mode === 'day') {
                filterStart = new Date(dateFilterState.value + 'T00:00:00');
                filterEnd = new Date(dateFilterState.value + 'T23:59:59');
            } else if (mode === 'range' && dateFilterState.start && dateFilterState.end) {
                filterStart = new Date(dateFilterState.start + 'T00:00:00');
                filterEnd = new Date(dateFilterState.end + 'T23:59:59');
            } else {
                const now = new Date();
                filterStart = new Date(now.getFullYear(), now.getMonth(), 1);
                filterEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            }

            const monthExpenses = txs.filter(t => {
                const d = new Date(t.date);
                return t.type === 'expense' && d >= filterStart && d <= filterEnd;
            });
            if (!hasBudgets || monthExpenses.length === 0) { container.innerHTML = ''; container.style.display = 'none'; return; }
            container.style.display = '';
            let rows = '';

            if (totalBudget > 0) {
                const totalSpent = monthExpenses.reduce((s, t) => s + t.amount, 0);
                const pct = Math.min((totalSpent / totalBudget) * 100, 100);
                const over = totalSpent > totalBudget;
                rows += `<div class="flex items-center gap-2.5">
                    <span class="text-[12px] text-white/60 font-normal w-12 shrink-0 truncate">${t('total_budget')}</span>
                    <div class="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-500" style="width:${pct}%;background:${over ? '#ef4444' : '#7c3aed'}"></div>
                    </div>
                    <span class="text-[12px] font-num ${over ? 'text-red-400' : 'text-white/35'} shrink-0 text-right">${totalSpent.toLocaleString()} / ${totalBudget.toLocaleString()}</span>
                </div>`;
            }

            keys.forEach(cat => {
                const budget = budgets[cat];
                const spent = monthExpenses.filter(t => t.cat === cat).reduce((s, t) => s + t.amount, 0);
                const pct = Math.min((spent / budget) * 100, 100);
                const catObj = EXPENSE_CATS[cat] || { label: cat, color: '#7c3aed' };
                const catLabel = t('cat_' + cat) || catObj.label;
                const overBudget = spent > budget;
                const barColor = overBudget ? '#ef4444' : catObj.color;
                rows += `<div class="flex items-center gap-2.5">
                    <span class="text-[12px] text-white/60 font-normal w-12 shrink-0 truncate">${catLabel}</span>
                    <div class="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-500" style="width:${pct}%;background:${barColor}"></div>
                    </div>
                    <span class="text-[12px] font-num ${overBudget ? 'text-red-400' : 'text-white/35'} shrink-0 text-right">${spent.toLocaleString()} / ${budget.toLocaleString()}</span>
                </div>`;
            });

            container.innerHTML = `<div class="glass-card-stats p-6 rounded-[24px]"><h3 class="text-[16px] font-normal text-white mb-4">${t('budget_stats') || '预算'}</h3><div class="space-y-3 text-[12px]">${rows}</div></div>`;
        }

        function renderHomeBudgetReminder() {
            const el = document.getElementById('home-budget-reminder');
            if (!el) return;
            if (totalBudget <= 0) { el.classList.add('hidden'); el.innerHTML = ''; return; }

            const now = new Date();
            const mode = dateFilterState.mode;
            let monthStart, monthEnd;
            if (mode === 'month') {
                const [fy, fm] = dateFilterState.value.split('-').map(Number);
                monthStart = new Date(fy, fm - 1, 1);
                monthEnd = new Date(fy, fm, 0, 23, 59, 59);
            } else if (!mode) {
                monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            } else {
                el.classList.add('hidden'); el.innerHTML = ''; return;
            }
            const spent = txs.filter(t => t.type === 'expense' && new Date(t.date) >= monthStart && new Date(t.date) <= monthEnd).reduce((s, t) => s + t.amount, 0);
            if (spent === 0) { el.classList.add('hidden'); el.innerHTML = ''; return; }

            const remain = totalBudget - spent;
            const pct = Math.round((spent / totalBudget) * 100);
            const over = remain < 0;

            let msg, color;
            if (over) {
                msg = `${t('budget_overspent')} ${Math.abs(remain).toLocaleString()}`;
                color = '#ef4444';
            } else if (pct >= 80) {
                msg = `${t('budget_used')} ${pct}%，${t('budget_remain')} ${remain.toLocaleString()}`;
                color = '#f59e0b';
            } else {
                msg = `${t('budget_used')} ${pct}%，${t('budget_remain')} ${remain.toLocaleString()}`;
                color = '#7c3aed';
            }

            el.classList.remove('hidden');
            el.innerHTML = `<div class="flex items-center justify-between px-4 py-2 rounded-2xl" style="background:linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(168,85,247,0.06) 50%, rgba(59,130,246,0.08) 100%)">
                <span class="text-[12px] text-white/80">${t('total_budget') || '总预算'} ${totalBudget.toLocaleString()}</span>
                <span class="text-[12px]" style="color:${color}">${msg}</span>
            </div>`;
        }

        function initSwipe(el) {
            let startX = 0, startY = 0;
            el.addEventListener('touchstart', e => {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                el._swiping = false;
            }, {passive: true});
            el.addEventListener('touchmove', e => {
                const dx = e.touches[0].clientX - startX;
                const dy = Math.abs(e.touches[0].clientY - startY);
                if (dy > 15) return;
                if (dx < -50) { el.classList.add('swiped'); el._swiping = true; }
                else if (dx > 50) { el.classList.remove('swiped'); el._swiping = true; }
            }, {passive: true});
        }

        function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

        function deleteTx(id) {
            const idx = txs.findIndex(t => String(t.id) === String(id));
            if (idx === -1) return;
            const removed = txs.splice(idx, 1)[0];
            pushUndo('delete', {...removed});
            renderAll();
            showToast(t('toast_deleted'));
        }

        function chatTime() {
            const n = new Date();
            return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
        }

        let chatWelcomed = false;
        function initChatWelcome() {
            if (chatWelcomed) return;
            chatWelcomed = true;
            const box = document.getElementById('chat-box');
            const welcomePairs = {
                zh: [
                    ['支出是熵，记录是对抗熵的唯一方式', '在混乱中留下秩序的痕迹'],
                    ['未被记录的消费，等于未曾拥有过的钱', '让每一笔存在都有证明'],
                    ['你不是在花钱，你是在选择成为谁', '我记录的不是数字，是你的轨迹'],
                    ['金钱是时间的化身，花的每一分都是生命', '让我帮你看清时间去了哪里'],
                    ['万物皆流，唯记录不朽', '在无常中锚定每一个瞬间'],
                    ['拥有即失去的开始，记录是唯一的挽留', '说出来，让消逝的变成永恒'],
                    ['你的账单是一部自传，每笔都是一个章节', '继续写，我帮你装订'],
                    ['存在先于本质——你的消费定义了你的本质', '让我见证你的定义过程'],
                ],
                en: [
                    ['Spending is entropy. Recording is the only way to fight it', 'Leave traces of order in the chaos'],
                    ['Unrecorded spending is money that never existed', 'Let every transaction have proof of existence'],
                    ['You\'re not spending — you\'re choosing who to become', 'I don\'t record numbers. I record your trajectory'],
                    ['Money is time incarnate. Every cent spent is life itself', 'Let me show you where your time went'],
                    ['All things flow. Only records endure', 'Anchor each moment against impermanence'],
                    ['To own is to begin losing. Recording is the only way to hold on', 'Speak it, and make the fleeting eternal'],
                    ['Your ledger is an autobiography. Each entry, a chapter', 'Keep writing. I\'ll bind the pages'],
                    ['Existence precedes essence — your spending defines who you are', 'Let me witness your definition'],
                ],
                ja: [
                    ['支出はエントロピー。記録だけがそれに抗える', '混沌の中に秩序の痕跡を残す'],
                    ['記録されない支出は、存在しなかったお金と同じ', 'すべての取引に存在証明を'],
                    ['お金を使うのではない、なりたい自分を選んでいる', '数字ではなく、軌跡を記録する'],
                    ['お金は時間の化身。使う一円は命そのもの', '時間がどこへ行ったか見せてあげる'],
                    ['万物は流れる。記録だけが残る', '無常の中で一瞬一瞬を留める'],
                    ['所有は喪失の始まり。記録だけが唯一の引き留め', '語れば、消えゆくものが永遠になる'],
                    ['帳簿は自伝。一件一件が一章', '書き続けて。製本は任せて'],
                    ['実存は本質に先立つ——支出があなたの本質を定義する', 'その定義の過程を見届けさせて'],
                ],
                ko: [
                    ['지출은 엔트로피. 기록만이 유일한 저항', '혼돈 속에 질서의 흔적을 남기다'],
                    ['기록되지 않은 소비는 존재하지 않은 돈과 같다', '모든 거래에 존재 증명을'],
                    ['돈을 쓰는 게 아니라, 누가 될지 선택하는 것', '숫자가 아닌 궤적을 기록합니다'],
                    ['돈은 시간의 화신. 쓰는 매 순간이 생명', '시간이 어디로 갔는지 보여드릴게요'],
                    ['만물은 흐른다. 오직 기록만 남는다', '무상함 속에서 매 순간을 고정하다'],
                    ['소유는 잃기의 시작. 기록만이 유일한 붙잡기', '말하면, 사라지는 것이 영원이 된다'],
                    ['당신의 장부는 자서전. 한 건 한 건이 한 장', '계속 써요. 제가 엮어드릴게요'],
                    ['실존은 본질에 앞선다 — 소비가 당신의 본질을 정의한다', '그 정의의 과정을 지켜보겠습니다'],
                ],
            };
            const pairs = welcomePairs[currentLang] || welcomePairs.zh;
            const pick = pairs[Math.floor(Math.random() * pairs.length)];
            const msgs = [
                { text: pick[0], delay: 300 },
                { text: pick[1], delay: 900 },
                { text: t('ai_guide'), delay: 1500 },
            ];
            msgs.forEach(m => {
                setTimeout(() => {
                    box.innerHTML += `<div class="flex justify-start mb-4 animate-fade-in"><div class="glass-card text-white/90 px-4 py-3 rounded-[24px] rounded-tl-sm text-[16px] border-0 shadow-lg whitespace-pre-line">${m.text}</div></div>`;
                    box.scrollTop = box.scrollHeight;
                    lucide.createIcons();
                }, m.delay);
            });
        }

        function showToast(msg, type = 'success') {
            const icons = { success: 'check-circle', error: 'alert-circle', info: 'info' };
            const colors = { success: 'text-teal-neon', error: 'text-red-400', info: 'text-cyber-purple' };
            const toast = document.createElement('div');
            toast.className = 'fixed top-12 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-[16px] bg-[#141416]/95 border-0 text-xs text-white/80 backdrop-blur-xl shadow-2xl flex items-center gap-2 animate-fade-in';
            toast.innerHTML = `<i data-lucide="${icons[type]}" class="w-4 h-4 ${colors[type]}"></i>${msg}`;
            document.body.appendChild(toast);
            lucide.createIcons({attrs: {class: ''}, nameAttr: 'data-lucide'});
            setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.5s'; }, 2500);
            setTimeout(() => toast.remove(), 3000);
        }

        // --- Date Filter Modal Logic ---
        function openDateFilterModal() {
            document.getElementById('date-filter-modal').classList.remove('hidden');
            initDatePicker();
            setDateFilterMode(dateFilterState.mode);
        }

        function closeDateFilterModal() {
            const modal = document.getElementById('date-filter-modal');
            modal.classList.add('hidden');
            modal.dataset.statsMode = '';
        }

        function setDateFilterMode(mode) {
            ['month','year','day','range'].forEach(m => {
                const btn = document.getElementById(`df-tab-${m}`);
                const div = document.getElementById(`df-input-${m}`);
                if (m === mode) {
                    btn.className = 'filter-pill active flex-1 text-center';
                    div.classList.remove('hidden');
                } else {
                    btn.className = 'filter-pill flex-1 text-center';
                    div.classList.add('hidden');
                }
            });
            document.getElementById('date-filter-modal').dataset.tempMode = mode;
            setTimeout(() => { _scrollVisiblePickers(mode); }, 30);
        }

        function _scrollVisiblePickers(mode) {
            const now = new Date();
            const cy = now.getFullYear(), cm = now.getMonth() + 1, cd = now.getDate();
            if (mode === 'month') {
                _scrollPickerTo('sp-month-year', cy);
                _scrollPickerTo('sp-month-month', cm);
                _hideFuture('sp-month-year', 'sp-month-month', null);
            } else if (mode === 'year') {
                _scrollPickerTo('sp-year', cy);
            } else if (mode === 'day') {
                _scrollPickerTo('sp-day-year', cy);
                _scrollPickerTo('sp-day-month', cm);
                _scrollPickerTo('sp-day-day', cd);
                _hideFuture('sp-day-year', 'sp-day-month', 'sp-day-day');
            } else if (mode === 'range') {
                _scrollPickerTo('sp-rs-year', cy);
                _scrollPickerTo('sp-rs-month', cm);
                _scrollPickerTo('sp-rs-day', 1);
                _scrollPickerTo('sp-re-year', cy);
                _scrollPickerTo('sp-re-month', cm);
                _scrollPickerTo('sp-re-day', cd);
                _hideFuture('sp-rs-year', 'sp-rs-month', 'sp-rs-day');
                _hideFuture('sp-re-year', 'sp-re-month', 'sp-re-day');
            }
        }

        function applyDateFilter() {
            const modal = document.getElementById('date-filter-modal');
            const mode = modal.dataset.tempMode || 'month';
            const isStats = modal.dataset.statsMode === 'true';

            if (isStats) {
                let startStr, endStr;
                if (mode === 'month') {
                    let y = getPickerValue('sp-month-year');
                    let m = getPickerValue('sp-month-month');
                    const _now = new Date();
                    if (y > _now.getFullYear()) { y = _now.getFullYear(); m = _now.getMonth()+1; }
                    else if (y === _now.getFullYear() && m > _now.getMonth()+1) { m = _now.getMonth()+1; }
                    const lastDay = new Date(y, m, 0).getDate();
                    startStr = `${y}-${String(m).padStart(2,'0')}-01`;
                    endStr = `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
                } else if (mode === 'year') {
                    const y = Math.min(getPickerValue('sp-year'), new Date().getFullYear());
                    startStr = `${y}-01-01`;
                    endStr = `${y}-12-31`;
                } else if (mode === 'day') {
                    const _d = clampDate(getPickerValue('sp-day-year'), getPickerValue('sp-day-month'), getPickerValue('sp-day-day'));
                    startStr = `${_d.y}-${String(_d.m).padStart(2,'0')}-${String(_d.d).padStart(2,'0')}`;
                    endStr = startStr;
                } else {
                    const _s = clampDate(getPickerValue('sp-rs-year'), getPickerValue('sp-rs-month'), getPickerValue('sp-rs-day'));
                    const _e = clampDate(getPickerValue('sp-re-year'), getPickerValue('sp-re-month'), getPickerValue('sp-re-day'));
                    startStr = `${_s.y}-${String(_s.m).padStart(2,'0')}-${String(_s.d).padStart(2,'0')}`;
                    endStr = `${_e.y}-${String(_e.m).padStart(2,'0')}-${String(_e.d).padStart(2,'0')}`;
                }
                if (startStr > endStr) { [startStr, endStr] = [endStr, startStr]; }
                customStatsRange.start = startStr;
                customStatsRange.end = endStr;
                currentStatsFilter = 'custom';
                document.querySelectorAll('.filter-pill').forEach(b => {
                    b.id === 'filter-custom' ? b.classList.add('active') : b.classList.remove('active');
                });
                modal.dataset.statsMode = '';
                closeDateFilterModal();
                renderCharts();
                return;
            }

            showAllHistory = false;
            dateFilterState.mode = mode;
            let labelText = '';

            if (mode === 'month') {
                let y = getPickerValue('sp-month-year');
                let m = getPickerValue('sp-month-month');
                const now = new Date();
                if (y > now.getFullYear()) { y = now.getFullYear(); m = now.getMonth()+1; }
                else if (y === now.getFullYear() && m > now.getMonth()+1) { m = now.getMonth()+1; }
                const val = `${y}-${String(m).padStart(2,'0')}`;
                dateFilterState.value = val;
                labelText = (y === now.getFullYear() && m === now.getMonth() + 1) ? t('this_month') : `${y}/${m}`;
            } else if (mode === 'year') {
                let val = getPickerValue('sp-year');
                const now = new Date();
                if (val > now.getFullYear()) val = now.getFullYear();
                dateFilterState.value = String(val);
                labelText = String(val);
            } else if (mode === 'day') {
                const _d = clampDate(getPickerValue('sp-day-year'), getPickerValue('sp-day-month'), getPickerValue('sp-day-day'));
                const val = `${_d.y}-${String(_d.m).padStart(2,'0')}-${String(_d.d).padStart(2,'0')}`;
                dateFilterState.value = val;
                const nowY = new Date().getFullYear();
                labelText = _d.y === nowY ? `${_d.m}.${_d.d}` : `${_d.y}.${_d.m}.${_d.d}`;
            } else if (mode === 'range') {
                const _s = clampDate(getPickerValue('sp-rs-year'), getPickerValue('sp-rs-month'), getPickerValue('sp-rs-day'));
                const _e = clampDate(getPickerValue('sp-re-year'), getPickerValue('sp-re-month'), getPickerValue('sp-re-day'));
                let startStr = `${_s.y}-${String(_s.m).padStart(2,'0')}-${String(_s.d).padStart(2,'0')}`;
                let endStr = `${_e.y}-${String(_e.m).padStart(2,'0')}-${String(_e.d).padStart(2,'0')}`;
                if (startStr > endStr) { [startStr, endStr] = [endStr, startStr]; }
                dateFilterState.start = startStr;
                dateFilterState.end = endStr;
                const nowY = new Date().getFullYear();
                const [sy,sm,sd] = startStr.split('-').map(Number);
                const [ey,em,ed] = endStr.split('-').map(Number);
                labelText = (sy === nowY && ey === nowY) ? `${sm}.${sd} - ${em}.${ed}` : `${sy}.${sm}.${sd} - ${ey}.${em}.${ed}`;
            }

            document.getElementById('label-date').innerText = labelText;
            closeDateFilterModal();
            listRenderCount = 50;
            renderAll();
            renderCharts();
            renderBudgetBars();
        }

        // --- Navigation ---
        let currentTab = 'home';
        function switchTab(page) {
            if (page === currentTab) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
            currentTab = page;

            document.querySelectorAll('.nav-item').forEach(btn => {
                if(btn.dataset.target === page) btn.classList.add('active');
                else btn.classList.remove('active');
            });

            ['home', 'stats', 'chat', 'profile'].forEach(p => {
                const el = document.getElementById(`page-${p}`);
                if (p === page) {
                    el.classList.remove('hidden');
                    el.classList.remove('animate-fade-in');
                    void el.offsetWidth;
                    el.classList.add('animate-fade-in');
                } else {
                    el.classList.add('hidden');
                }
            });

            window.scrollTo(0, 0);

            const chatInput = document.getElementById('chat-input-wrapper');
            if (page === 'chat') {
                chatInput.classList.remove('hidden'); initChatWelcome();
                document.body.style.background = 'radial-gradient(120% 35% at 50% 0%, rgba(124,58,237,0.35) 0%, rgba(88,28,195,0.12) 50%, transparent 100%) no-repeat, #000';
                document.body.style.overflow = 'hidden';
            } else {
                chatInput.classList.add('hidden');
                document.body.style.background = '';
                document.body.style.overflow = '';
            }

            if(page === 'stats') { renderCharts(); renderBudgetBars(); }
            if(page === 'profile') { renderBookSelector(); lucide.createIcons(); }
        }

        // --- Chart & Stats Logic ---
        function renderCharts() {
            const ctx = document.getElementById('trendChart').getContext('2d');

            let now = new Date();
            let startDate = new Date(0);
            let isDaily = false;

            if (currentStatsFilter === 'month') {
                const mode = dateFilterState.mode;
                if (mode === 'month') {
                    const [fy, fm] = (dateFilterState.value || '').split('-').map(Number);
                    startDate = new Date(fy, fm - 1, 1);
                    now = new Date(fy, fm, 0, 23, 59, 59);
                    isDaily = true;
                } else if (mode === 'year') {
                    const fy = parseInt(dateFilterState.value);
                    startDate = new Date(fy, 0, 1);
                    now = new Date(fy, 11, 31, 23, 59, 59);
                } else if (mode === 'day') {
                    startDate = new Date(dateFilterState.value + 'T00:00:00');
                    now = new Date(dateFilterState.value + 'T23:59:59');
                    isDaily = true;
                } else if (mode === 'range' && dateFilterState.start && dateFilterState.end) {
                    startDate = new Date(dateFilterState.start + 'T00:00:00');
                    now = new Date(dateFilterState.end + 'T23:59:59');
                    const diffDays = (now - startDate) / (1000 * 60 * 60 * 24);
                    if (diffDays <= 31) isDaily = true;
                } else {
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    now = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                    isDaily = true;
                }
            } else if (currentStatsFilter === '3months') {
                startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
            } else if (currentStatsFilter === '6months') {
                startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
            } else if (currentStatsFilter === 'year') {
                startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
            } else if (currentStatsFilter === 'all') {
                const earliest = txs.length > 0 ? txs.reduce((min, t) => { const d = new Date(t.date); return d < min ? d : min; }, new Date()) : new Date();
                startDate = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
                const diffDays = (now - startDate) / (1000 * 60 * 60 * 24);
                if (diffDays <= 31) isDaily = true;
            } else if (currentStatsFilter === 'custom' && customStatsRange.start && customStatsRange.end) {
                startDate = new Date(customStatsRange.start + 'T00:00:00');
                now = new Date(customStatsRange.end + 'T23:59:59');
                const diffDays = (now - startDate) / (1000 * 60 * 60 * 24);
                if (diffDays <= 31) isDaily = true;
            }

            // Update range label
            const _rl = document.getElementById('trend-range-label');
            if (_rl) {
                const _fmt = d => `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()}`;
                if (startDate.getTime() <= 0) { _rl.textContent = ''; }
                else if (startDate.toDateString() === now.toDateString()) { _rl.textContent = _fmt(startDate); }
                else { _rl.textContent = `${_fmt(startDate)} - ${_fmt(now)}`; }
            }

            const expenseTxs = txs.filter(t => {
                const d = new Date(t.date);
                return d >= startDate && d <= now && t.type === 'expense';
            });
            const incomeTxs = txs.filter(t => {
                const d = new Date(t.date);
                return d >= startDate && d <= now && t.type === 'income';
            });

            // Category ranking (expense)
            const catTotals = {};
            let totalExpense = 0;
            expenseTxs.forEach(t => {
                catTotals[t.cat] = (catTotals[t.cat] || 0) + t.amount;
                totalExpense += t.amount;
            });

            // Category ranking (income)
            const incomeCatTotals = {};
            let totalIncome = 0;
            incomeTxs.forEach(t => {
                incomeCatTotals[t.cat] = (incomeCatTotals[t.cat] || 0) + t.amount;
                totalIncome += t.amount;
            });

            const sortedCats = Object.keys(catTotals).sort((a,b) => catTotals[b] - catTotals[a]);
            const sortedIncomeCats = Object.keys(incomeCatTotals).sort((a,b) => incomeCatTotals[b] - incomeCatTotals[a]);

            // --- Pie Chart (Rounded Arc Style) ---
            const pieCanvas = document.getElementById('pieChart');
            const pieLegend = document.getElementById('pie-legend');
            const pieCenterLabel = document.getElementById('pie-center-label');
            const pieCenterAmount = document.getElementById('pie-center-amount');

            const isExpensePie = currentPieType === 'expense';
            const pieCats = isExpensePie ? sortedCats : sortedIncomeCats;
            const pieTotals = isExpensePie ? catTotals : incomeCatTotals;
            const pieTotal = isExpensePie ? totalExpense : totalIncome;
            const pieCatMap = isExpensePie ? EXPENSE_CATS : INCOME_CATS;

            pieCenterLabel.textContent = isExpensePie ? t('expense') : t('income');
            pieCenterAmount.textContent = pieTotal > 0 ? pieTotal.toLocaleString() : '0';

            if (pieChart) { pieChart.destroy(); pieChart = null; }

            if (pieCats.length === 0) {
                pieCanvas.style.display = 'none';
                document.getElementById('pie-center').style.display = 'none';
                pieLegend.innerHTML = `<div class="flex flex-col items-center justify-center py-6 gap-2 -mt-[200px]">
                    <i data-lucide="pie-chart" class="w-8 h-8 text-white/10"></i>
                    <p class="text-white/25 text-[13px]">${t('no_stats_data')}</p>
                </div>`;
                lucide.createIcons();
            } else {
                pieCanvas.style.display = '';
                document.getElementById('pie-center').style.display = '';
                const pieColors = pieCats.map(k => (pieCatMap[k] || {}).color || '#666');
                const pieData = pieCats.map(k => pieTotals[k]);
                const pieLabels = pieCats.map(k => t('cat_' + k) || (pieCatMap[k] || {}).label || k);

                pieChart = new Chart(pieCanvas.getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: pieLabels,
                        datasets: [{
                            data: pieData,
                            backgroundColor: pieColors,
                            borderColor: 'transparent',
                            borderWidth: 0,
                            hoverBorderColor: 'rgba(255,255,255,0.15)',
                            hoverBorderWidth: 2,
                            borderRadius: 2,
                            spacing: 2,
                            pointStyle: 'circle'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '70%',
                        layout: { padding: 6 },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: '#1a1a2e',
                                borderColor: 'transparent',
                                borderWidth: 0,
                                titleFont: { size: 14, weight: '400' },
                                bodyFont: { size: 14, weight: '400' },
                                padding: 12,
                                cornerRadius: 12,
                                displayColors: true,
                                boxWidth: 10,
                                boxHeight: 10,
                                boxPadding: 6,
                                usePointStyle: true,
                                pointStyleWidth: 10,
                                position: 'average',
                                xAlign: 'center',
                                yAlign: 'top',
                                multiKeyBackground: 'transparent',
                                callbacks: {
                                    label: function(ctx) {
                                        const val = ctx.parsed;
                                        const pct = pieTotal > 0 ? ((val / pieTotal) * 100).toFixed(1) : 0;
                                        return ` ${val.toLocaleString()}  (${pct}%)`;
                                    }
                                }
                            }
                        },
                        animation: {
                            animateRotate: true,
                            duration: 800,
                            easing: 'easeOutQuart'
                        }
                    }
                });

                pieLegend.innerHTML = pieCats.map((catKey) => {
                    const amt = pieTotals[catKey];
                    const percent = pieTotal > 0 ? ((amt / pieTotal) * 100).toFixed(1) : 0;
                    const catInfo = pieCatMap[catKey] || { label: '?', color: '#666', icon: 'tag' };
                    const catName = t('cat_' + catKey) || catInfo.label;
                    return `<div class="flex items-center gap-3">
                        <div class="w-3 h-3 rounded-[4px] flex-shrink-0" style="background:${catInfo.color}"></div>
                        <span class="text-[14px] font-normal text-white/60 flex-1 truncate">${catName}</span>
                        <span class="text-[14px] font-normal text-white font-num">${amt.toLocaleString()}</span>
                        <span class="text-[14px] font-normal text-white/30 font-num w-[40px] text-right">${percent}%</span>
                    </div>`;
                }).join('');
            }

            let labels = [];
            let expensePoints = [];
            let incomePoints = [];
            let labelKeys = [];

            if (isDaily) {
                const startDay = new Date(startDate);
                startDay.setHours(0,0,0,0);
                const totalDays = Math.ceil((now - startDay) / (24*60*60*1000)) + 1;
                const useOffset = (now.getMonth() !== startDay.getMonth() || now.getFullYear() !== startDay.getFullYear());
                const limitDay = useOffset ? totalDays : now.getDate();
                if (useOffset) {
                    labels = Array.from({length: limitDay}, (_, i) => { const d = new Date(startDay.getTime() + i*24*60*60*1000); return `${d.getMonth()+1}/${d.getDate()}`; });
                } else {
                    const step = limitDay <= 15 ? 2 : 5;
                    labels = Array.from({length: limitDay}, (_, i) => {
                        const day = i + 1;
                        if (day === 1 || day === limitDay || day % step === 0) return day;
                        return '';
                    });
                }
                expensePoints = new Array(limitDay).fill(0);
                incomePoints = new Array(limitDay).fill(0);

                expenseTxs.forEach(t => {
                    const d = new Date(t.date);
                    const idx = useOffset ? Math.floor((d - startDay) / (24*60*60*1000)) : d.getDate() - 1;
                    if (idx >= 0 && idx < limitDay) expensePoints[idx] += t.amount;
                });
                incomeTxs.forEach(t => {
                    const d = new Date(t.date);
                    const idx = useOffset ? Math.floor((d - startDay) / (24*60*60*1000)) : d.getDate() - 1;
                    if (idx >= 0 && idx < limitDay) incomePoints[idx] += t.amount;
                });
            } else {
                const expMonthMap = {};
                const incMonthMap = {};
                labelKeys = [];
                let ptr = new Date(startDate);
                ptr.setDate(1);

                while(ptr <= now) {
                    const k = `${ptr.getFullYear()}-${ptr.getMonth()+1}`;
                    if(!labelKeys.includes(k)) labelKeys.push(k);
                    expMonthMap[k] = 0;
                    incMonthMap[k] = 0;
                    ptr.setMonth(ptr.getMonth() + 1);
                }

                expenseTxs.forEach(t => {
                    const d = new Date(t.date);
                    const k = `${d.getFullYear()}-${d.getMonth()+1}`;
                    if (expMonthMap[k] !== undefined) expMonthMap[k] += t.amount;
                });
                incomeTxs.forEach(t => {
                    const d = new Date(t.date);
                    const k = `${d.getFullYear()}-${d.getMonth()+1}`;
                    if (incMonthMap[k] !== undefined) incMonthMap[k] += t.amount;
                });

                const totalMonths = labelKeys.length;
                const spanYears = totalMonths > 0 ? (parseInt(labelKeys[totalMonths-1].split('-')[0]) - parseInt(labelKeys[0].split('-')[0])) : 0;
                labels = labelKeys.map((k, i) => {
                    const [y, m] = k.split('-');
                    if (totalMonths <= 12) return spanYears > 0 ? `${m}/${y.slice(2)}` : m;
                    if (m === '1' || i === 0) return `${y}`;
                    return '';
                });
                expensePoints = labelKeys.map(k => expMonthMap[k]);
                incomePoints = labelKeys.map(k => incMonthMap[k]);
            }

            if (trendChart) trendChart.destroy();

            const trendEmpty = document.getElementById('trend-empty');
            const trendCanvas = document.getElementById('trendChart');
            const hasTrendData = expensePoints.some(v => v > 0) || incomePoints.some(v => v > 0);
            if (!hasTrendData) {
                trendCanvas.style.display = 'none';
                trendEmpty.style.display = 'flex';
                lucide.createIcons();
            } else {
                trendCanvas.style.display = '';
                trendEmpty.style.display = 'none';
            }

            if (!hasTrendData) { /* skip chart creation */ } else {

            const expGradient = ctx.createLinearGradient(0, 0, 0, 400);
            expGradient.addColorStop(0, 'rgba(124, 58, 237, 0.25)');
            expGradient.addColorStop(1, 'rgba(124, 58, 237, 0)');

            const incGradient = ctx.createLinearGradient(0, 0, 0, 400);
            incGradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
            incGradient.addColorStop(1, 'rgba(16, 185, 129, 0)');

            trendChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [chartDisplayType === 'expense' ? {
                        label: ai('expense_label'),
                        data: expensePoints,
                        borderColor: '#7c3aed',
                        backgroundColor: expGradient,
                        borderWidth: 2,
                        pointBackgroundColor: '#7c3aed',
                        pointBorderColor: '#7c3aed',
                        pointBorderWidth: 0,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        tension: 0.4,
                        fill: true,
                        clip: false
                    } : {
                        label: ai('income_label'),
                        data: incomePoints,
                        borderColor: '#10b981',
                        backgroundColor: incGradient,
                        borderWidth: 2,
                        pointBackgroundColor: '#10b981',
                        pointBorderColor: '#10b981',
                        pointBorderWidth: 0,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        tension: 0.4,
                        fill: true,
                        clip: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 10, left: 6, right: 6, bottom: 0 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            enabled: false,
                            mode: 'index',
                            intersect: false,
                            external: function(context) {
                                let el = document.getElementById('chart-tooltip');
                                if (!el) {
                                    el = document.createElement('div');
                                    el.id = 'chart-tooltip';
                                    el.style.cssText = 'position:absolute;pointer-events:none;background:rgba(10,10,15,0.7);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(124,58,237,0.2);border-radius:10px;padding:8px 12px;font-size:12px;color:#fff;transition:opacity 0.15s;z-index:99;';
                                    document.body.appendChild(el);
                                }
                                const tooltip = context.tooltip;
                                if (tooltip.opacity === 0) { el.style.opacity = '0'; return; }
                                let title = '';
                                if (tooltip.dataPoints && tooltip.dataPoints.length) {
                                    const idx = tooltip.dataPoints[0].dataIndex;
                                    if (isDaily) {
                                        const d = new Date(startDate);
                                        d.setHours(0,0,0,0);
                                        d.setDate(d.getDate() + idx);
                                        title = `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()}`;
                                    } else {
                                        title = labelKeys[idx] || tooltip.title[0] || '';
                                    }
                                }
                                let body = tooltip.dataPoints.map(p => `<div style="color:rgba(255,255,255,0.6);margin-top:3px">${p.dataset.label} ${p.parsed.y.toLocaleString()}</div>`).join('');
                                el.innerHTML = `<div style="font-weight:600;font-size:13px;margin-bottom:2px">${title}</div>${body}`;
                                el.style.opacity = '1';
                                const pos = context.chart.canvas.getBoundingClientRect();
                                let ttLeft = pos.left + window.scrollX + tooltip.caretX;
                                let ttTop = pos.top + window.scrollY + tooltip.caretY - el.offsetHeight - 8;
                                const vw = window.innerWidth;
                                const elW = el.offsetWidth;
                                if (ttLeft + elW > vw - 8) ttLeft = vw - elW - 8;
                                if (ttLeft < 8) ttLeft = 8;
                                if (ttTop < window.scrollY + 8) ttTop = pos.top + window.scrollY + tooltip.caretY + 12;
                                el.style.left = ttLeft + 'px';
                                el.style.top = ttTop + 'px';
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false, drawBorder: false },
                            ticks: {
                                color: '#64748b',
                                font: { size: 10, family: 'Inter' },
                                autoSkip: false,
                                maxRotation: 0
                            }
                        },
                        y: {
                            display: false,
                            grid: { display: false },
                            beginAtZero: true
                        }
                    },
                    interaction: {
                        mode: 'nearest',
                        axis: 'x',
                        intersect: false
                    },
                    onClick: function(e, elements) {
                        const el = document.getElementById('chart-tooltip');
                        if (el && el.style.opacity === '1' && elements.length === 0) {
                            el.style.opacity = '0';
                        }
                    }
                }
            });

            const canvas = document.getElementById('trendChart');
            canvas.addEventListener('touchend', function() {
                setTimeout(() => {
                    const el = document.getElementById('chart-tooltip');
                    if (el && el.style.opacity === '1') {
                        setTimeout(() => { el.style.opacity = '0'; }, 2500);
                    }
                }, 100);
            });

            } // end hasTrendData else
        }

        // --- Filter Logic ---
        function cycleTypeFilter() {
            if (listFilterType === 'all') {
                listFilterType = 'expense';
                document.getElementById('label-type').innerText = t('all_expense');
            } else if (listFilterType === 'expense') {
                listFilterType = 'income';
                document.getElementById('label-type').innerText = t('all_income');
            } else {
                listFilterType = 'all';
                document.getElementById('label-type').innerText = t('all_types');
            }
            listFilterCat = 'all';
            document.getElementById('label-cat').innerText = t('all_cats');
            listRenderCount = 50;
            renderTransactionList();
        }

        function openFilterCatModal() {
            tempFilterCats = listFilterCat === 'all' ? [] : [...listFilterCat];
            renderFilterCatGrid();
            document.getElementById('filter-cat-modal').classList.remove('hidden');
        }
        function renderFilterCatGrid() {
            const list = document.getElementById('filter-cat-list');
            const cats = listFilterType === 'income' ? INCOME_CATS : (listFilterType === 'expense' ? EXPENSE_CATS : {...EXPENSE_CATS, ...INCOME_CATS});
            const isAll = tempFilterCats.length === 0;

            let html = `<div class="grid grid-cols-4 gap-x-2 gap-y-4">`;
            html += `<div onclick="toggleFilterCat('all')" class="flex flex-col items-center gap-2 py-2 cursor-pointer">
                <div class="w-12 h-12 rounded-full flex items-center justify-center ${isAll ? 'bg-[#7c3aed]' : 'bg-white/5'}" style="color:#fff">
                    <i data-lucide="layers" class="w-6 h-6"></i>
                </div>
                <span class="text-[14px] ${isAll ? 'text-white font-bold' : 'text-white/40'}">${t('all')}</span>
            </div>`;
            for(let k in cats) {
                const isSelected = tempFilterCats.includes(k);
                const catName = t('cat_' + k) || cats[k].label;
                html += `<div onclick="toggleFilterCat('${k}')" class="flex flex-col items-center gap-2 py-2 cursor-pointer">
                    <div class="w-12 h-12 rounded-full flex items-center justify-center ${isSelected ? 'bg-[#7c3aed]' : 'bg-white/5'}" style="color:${isSelected ? '#fff' : cats[k].color}">
                        <i data-lucide="${cats[k].icon||'tag'}" class="w-6 h-6"></i>
                    </div>
                    <span class="text-[14px] ${isSelected ? 'text-white font-bold' : 'text-white/40'}">${catName}</span>
                </div>`;
            }
            html += `</div>`;
            list.innerHTML = html;
            lucide.createIcons();
        }
        function toggleFilterCat(key) {
            if (key === 'all') {
                tempFilterCats = [];
            } else {
                const idx = tempFilterCats.indexOf(key);
                if (idx > -1) tempFilterCats.splice(idx, 1);
                else tempFilterCats.push(key);
            }
            renderFilterCatGrid();
        }
        function confirmFilterCat() {
            if (tempFilterCats.length === 0) {
                listFilterCat = 'all';
                document.getElementById('label-cat').innerText = t('all_cats');
            } else if (tempFilterCats.length === 1) {
                listFilterCat = [...tempFilterCats];
                const cats = {...EXPENSE_CATS, ...INCOME_CATS};
                document.getElementById('label-cat').innerText = t('cat_' + tempFilterCats[0]) || cats[tempFilterCats[0]]?.label || '';
            } else {
                listFilterCat = [...tempFilterCats];
                document.getElementById('label-cat').innerText = tempFilterCats.length + t('cat_label');
            }
            closeFilterCatModal();
            listRenderCount = 50;
            renderTransactionList();
        }

        function closeFilterCatModal() { document.getElementById('filter-cat-modal').classList.add('hidden'); }

        // --- Speech ---
        // 规则: 1.只弹一次权限 2.不叠加旧文字 3.每次都能用
        // 方案: continuous:true + 永不stop/abort + offset追踪
        let speechActive = false;
        let speechRunning = false;
        let silenceTimer = null;
        let lastInterim = '';
        let _resultOffset = 0;
        let _lastResultsLen = 0;

        function finishSpeech(text) {
            if (!text || !speechActive) return;
            speechActive = false;
            isListening = false;
            lastInterim = '';
            _resultOffset = _lastResultsLen;
            if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
            document.getElementById('mic-btn').classList.remove('mic-active');
            hideVoiceOverlay();
            if (document.getElementById('page-chat').classList.contains('hidden')) {
                switchTab('chat');
            }
            addVoiceBubble(text);
            const box = document.getElementById('chat-box');
            setTimeout(() => {
                 const aiRes = processAI(text);
                 box.innerHTML += `<div class="flex justify-start mb-4"><div class="glass-card text-white/90 px-4 py-3 rounded-[24px] rounded-tl-sm text-[16px] border-0 shadow-lg ">${aiRes}</div></div>`;
                 box.scrollTop = box.scrollHeight;
                 lucide.createIcons();
            }, 800);
        }

        function resetSilenceTimer() {
            if (silenceTimer) clearTimeout(silenceTimer);
            silenceTimer = setTimeout(() => {
                if (speechActive && lastInterim) {
                    finishSpeech(lastInterim);
                    lastInterim = '';
                }
            }, 1500);
        }

        function initSpeech() {
            if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                recognition = new SpeechRecognition();
                const langMap = {zh:'zh-CN', en:'en-US', ja:'ja-JP', ko:'ko-KR'};
                recognition.lang = langMap[currentLang] || 'zh-CN';
                recognition.continuous = true;
                recognition.interimResults = true;

                recognition.onend = function() {
                    speechRunning = false;
                    if (speechActive) {
                        if (lastInterim) {
                            finishSpeech(lastInterim);
                            lastInterim = '';
                        } else {
                            speechActive = false;
                            isListening = false;
                            document.getElementById('mic-btn').classList.remove('mic-active');
                            hideVoiceOverlay();
                        }
                    }
                };

                recognition.onresult = function(event) {
                    _lastResultsLen = event.results.length;
                    if (!speechActive) {
                        _resultOffset = event.results.length;
                        return;
                    }
                    // iOS可能重置results数组
                    if (_resultOffset > event.results.length) {
                        _resultOffset = 0;
                    }
                    let finalTranscript = '';
                    let interimTranscript = '';
                    const start = Math.max(event.resultIndex, _resultOffset);
                    for (let i = start; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            finalTranscript += event.results[i][0].transcript;
                        } else {
                            interimTranscript += event.results[i][0].transcript;
                        }
                    }
                    if (!finalTranscript && !interimTranscript) return;
                    const interimEl = document.getElementById('voice-interim-text');
                    if (interimEl) interimEl.innerText = interimTranscript || finalTranscript;
                    if (finalTranscript) {
                        _resultOffset = event.results.length;
                        finishSpeech(finalTranscript);
                    } else if (interimTranscript) {
                        lastInterim = interimTranscript;
                        resetSilenceTimer();
                    }
                };
            }
        }

        function showVoiceOverlay() {
            const overlay = document.getElementById('voice-overlay');
            if (overlay) {
                overlay.classList.add('active');
                document.getElementById('voice-interim-text').innerText = '';
            }
        }
        function hideVoiceOverlay() {
            const overlay = document.getElementById('voice-overlay');
            if (overlay) overlay.classList.remove('active');
        }

        function toggleSpeech() {
            if (speechActive || isListening) {
                speechActive = false;
                isListening = false;
                lastInterim = '';
                _resultOffset = _lastResultsLen;
                if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
                document.getElementById('mic-btn').classList.remove('mic-active');
                hideVoiceOverlay();
                return;
            }
            if (!recognition) return;
            const langMap = {zh:'zh-CN', en:'en-US', ja:'ja-JP', ko:'ko-KR'};
            recognition.lang = langMap[currentLang] || 'zh-CN';
            speechActive = true;
            isListening = true;
            lastInterim = '';
            document.getElementById('mic-btn').classList.add('mic-active');
            showVoiceOverlay();
            // 尝试start - 如果已在运行会抛错，忽略即可（说明recognition活着）
            try { recognition.start(); speechRunning = true; } catch(e) {}
        }

        // --- API Key & Fallback Speech (getUserMedia + Gemini) ---
        function openApiKeyPanel() {
            const saved = nfStorage.getItem('gemini_api_key') || '';
            document.getElementById('apikey-input').value = saved;
            document.getElementById('apikey-modal').classList.remove('hidden');
        }
        function closeApiKeyPanel() {
            document.getElementById('apikey-modal').classList.add('hidden');
        }
        function saveApiKey() {
            const key = document.getElementById('apikey-input').value.trim();
            if (key) {
                nfStorage.setItem('gemini_api_key', key);
                updateApiKeyStatus();
                closeApiKeyPanel();
                showToast(t('toast_updated'));
            }
        }
        function clearApiKey() {
            nfStorage.removeItem('gemini_api_key');
            document.getElementById('apikey-input').value = '';
            updateApiKeyStatus();
            closeApiKeyPanel();
            showToast(t('toast_deleted'));
        }
        function updateApiKeyStatus() {
            const el = document.getElementById('api-key-status');
            if (el) el.textContent = nfStorage.getItem('gemini_api_key') ? t('api_set') : t('api_not_set');
        }

        let mediaRecorder = null;
        let audioChunks = [];
        let isRecordingFallback = false;

        function usesFallbackSpeech() {
            return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
        }

        let cachedAudioStream = null;
        let micPermissionGranted = false;
        async function getAudioStream() {
            if (cachedAudioStream && cachedAudioStream.active) {
                return cachedAudioStream.clone();
            }
            cachedAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micPermissionGranted = true;
            return cachedAudioStream.clone();
        }
        async function prewarmMic() {
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
                cachedAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                micPermissionGranted = true;
            } catch(e) {}
        }

        async function startFallbackRecording() {
            const apiKey = nfStorage.getItem('gemini_api_key');
            if (!apiKey) {
                showToast(currentLang==='zh'?'语音需要配置Gemini API Key':'Speech requires Gemini API Key', 'error');
                setTimeout(() => openApiKeyPanel(), 500);
                return;
            }
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showToast(currentLang==='zh'?'此设备不支持麦克风录制':'Microphone not supported', 'error');
                return;
            }
            try {
                const stream = await getAudioStream();
                let mimeType = 'audio/mp4';
                if (typeof MediaRecorder.isTypeSupported === 'function') {
                    if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
                    else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
                    else if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
                    else mimeType = '';
                }
                mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
                if (!mimeType) mimeType = mediaRecorder.mimeType || 'audio/mp4';
                audioChunks = [];
                isRecordingFallback = true;

                const btn = document.getElementById('mic-btn');
                btn.classList.add('mic-active');
                showVoiceOverlay();

                mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
                mediaRecorder.onstop = async () => {
                    stream.getTracks().forEach(tr => tr.stop());
                    btn.classList.remove('mic-active');
                    isRecordingFallback = false;
                    hideVoiceOverlay();
                    if (audioChunks.length === 0) {
                        showToast(currentLang==='zh'?'未录到声音':'No audio captured', 'error');
                        return;
                    }
                    const audioBlob = new Blob(audioChunks, { type: mimeType });
                    showToast(currentLang==='zh'?'识别中...':'Transcribing...');
                    await transcribeWithGemini(audioBlob, mimeType);
                };
                mediaRecorder.onerror = (e) => {
                    btn.classList.remove('mic-active');
                    isRecordingFallback = false;
                    hideVoiceOverlay();
                    showToast(currentLang==='zh'?'录音出错':'Recording error', 'error');
                };
                mediaRecorder.start(1000);
            } catch(e) {
                showToast(currentLang==='zh'?'麦克风访问失败，请在设置中允许麦克风权限':'Microphone access failed', 'error');
            }
        }

        function stopFallbackRecording() {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
        }

        async function transcribeWithGemini(blob, mimeType) {
            const apiKey = nfStorage.getItem('gemini_api_key');
            try {
                const base64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = () => reject(new Error('read failed'));
                    reader.readAsDataURL(blob);
                });
                const langMap = {zh:'zh-CN', en:'en-US', ja:'ja-JP', ko:'ko-KR'};
                const lang = langMap[currentLang] || 'zh-CN';
                const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [
                            { inlineData: { mimeType: mimeType, data: base64 } },
                            { text: `Transcribe this audio to text. Language: ${lang}. Return ONLY the transcribed text, nothing else.` }
                        ]}]
                    })
                });
                if (!resp.ok) {
                    const errData = await resp.json().catch(() => ({}));
                    const errMsg = errData?.error?.message || `HTTP ${resp.status}`;
                    showToast(`识别失败: ${errMsg}`, 'error');
                    return;
                }
                const data = await resp.json();
                const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                if (text) {
                    if (document.getElementById('page-chat').classList.contains('hidden')) switchTab('chat');
                    addVoiceBubble(text);
                    const box = document.getElementById('chat-box');
                    if (isProActive()) {
                        box.innerHTML += `<div class="ai-typing-indicator" class="flex justify-start mb-4"><div class="glass-card text-white/50 px-4 py-3 rounded-[24px] rounded-tl-sm text-[14px] border-0 shadow-lg">${t('pro_thinking')}</div></div>`;
                        box.scrollTop = box.scrollHeight;
                        processAIWithLLM(text).then(aiRes => {
                            const typing = document.getElementById('ai-typing');
                            if (typing) typing.remove();
                            box.innerHTML += `<div class="flex justify-start mb-4"><div class="glass-card text-white/90 px-4 py-3 rounded-[24px] rounded-tl-sm text-[16px] border-0 shadow-lg">${aiRes}</div></div>`;
                            box.scrollTop = box.scrollHeight;
                            lucide.createIcons();
                        });
                    } else {
                        setTimeout(() => {
                            const aiRes = processAI(text);
                            box.innerHTML += `<div class="flex justify-start mb-4"><div class="glass-card text-white/90 px-4 py-3 rounded-[24px] rounded-tl-sm text-[16px] border-0 shadow-lg">${aiRes}</div></div>`;
                            box.scrollTop = box.scrollHeight;
                        }, 800);
                    }
                } else {
                    showToast(currentLang==='zh'?'未识别到语音内容':'No speech detected', 'error');
                }
            } catch(e) {
                showToast(currentLang==='zh'?`语音识别失败: ${e.message||'网络错误'}`:`Failed: ${e.message||'network error'}`, 'error');
            }
        }

        function addVoiceBubble(text) {
             const box = document.getElementById('chat-box');
             const duration = Math.floor(Math.random() * 3) + 2; 
             const html = `
                <div class="flex justify-end mb-4 animate-fade-in">
                    <div class="flex flex-col items-end gap-1">
                        <div class="voice-bubble">
                            <i data-lucide="play" class="w-3 h-3 fill-white"></i>
                            <div class="voice-waves">
                                <div class="voice-bar"></div>
                                <div class="voice-bar"></div>
                                <div class="voice-bar"></div>
                                <div class="voice-bar"></div>
                                <div class="voice-bar"></div>
                            </div>
                            <span class="text-xs font-num font-medium">${duration}"</span>
                        </div>
                        <span class="text-[10px] text-white/35 pr-2">"${escHtml(text)}"</span>
                    </div>
                </div>
             `;
             box.innerHTML += html;
             lucide.createIcons();
             box.scrollTop = box.scrollHeight;
        }

        // --- AI Logic (Enhanced) ---
        function getMonday(d) {
          d = new Date(d);
          var day = d.getDay(),
              diff = d.getDate() - day + (day == 0 ? -6:1); // adjust when day is sunday
          d.setDate(diff);
          d.setHours(0,0,0,0);
          return d;
        }

        function parseTime(text) {
            const now = new Date();
            let start = new Date(now);
            let end = new Date(now);
            let label = "";
            let matchedStr = "";

            // Match "M.D" or "M/D" at start followed by non-digit (e.g. "6.1午饭", "12/3买菜")
            const dotDateRegex = /^(\d{1,2})[./](\d{1,2})(?=[^\d])/;
            const dotMatch = text.match(dotDateRegex);
            if (dotMatch) {
                const m = parseInt(dotMatch[1]), d = parseInt(dotMatch[2]);
                if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
                    const year = now.getFullYear();
                    start = new Date(year, m - 1, d, 0, 0, 0, 0);
                    end = new Date(year, m - 1, d, 23, 59, 59, 999);
                    label = `${m}月${d}日`;
                    matchedStr = dotMatch[0];
                    return { start, end, label, match: matchedStr };
                }
            }

            // Match "X月X号/日" (specific date)
            const dateRegex = /(\d{4}年)?(\d{1,2})月(\d{1,2})[号日]/;
            const match = text.match(dateRegex);

            if (match) {
                const yearStr = match[1];
                const monthStr = match[2];
                const dayStr = match[3];

                let year = now.getFullYear();
                if (yearStr) {
                    year = parseInt(yearStr.replace("年", ""));
                }

                const month = parseInt(monthStr) - 1;
                const day = parseInt(dayStr);

                start = new Date(year, month, day, 0, 0, 0, 0);
                end = new Date(year, month, day, 23, 59, 59, 999);

                label = `${month + 1}月${day}日`;
                matchedStr = match[0];

                return { start, end, label, match: matchedStr };
            }

            // Match "X月" alone (entire month, no day specified)
            const monthOnlyRegex = /(\d{4}年)?(\d{1,2})月(?!\d)/;
            const monthMatch = text.match(monthOnlyRegex);
            if (monthMatch) {
                let year = now.getFullYear();
                if (monthMatch[1]) year = parseInt(monthMatch[1].replace("年", ""));
                const month = parseInt(monthMatch[2]) - 1;
                start = new Date(year, month, 1, 0, 0, 0, 0);
                end = new Date(year, month + 1, 0, 23, 59, 59, 999);
                label = `${month + 1}月`;
                matchedStr = monthMatch[0];
                return { start, end, label, match: matchedStr };
            }

            if(text.includes("今天")) {
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                label = "今天"; matchedStr = "今天";
            }
            else if(text.includes("昨天")) {
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate()-1, 0, 0, 0, 0);
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate()-1, 23, 59, 59, 999);
                label = "昨天"; matchedStr = "昨天";
            }
            else if(text.includes("大前天")) {
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate()-3, 0, 0, 0, 0);
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate()-3, 23, 59, 59, 999);
                label = "大前天"; matchedStr = "大前天";
            }
            else if(text.includes("前天")) {
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate()-2, 0, 0, 0, 0);
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate()-2, 23, 59, 59, 999);
                label = "前天"; matchedStr = "前天";
            }
            // "前X天" / "最近X天"
            else if(text.match(/(前|最近)(\d+)天/)) {
                const m2 = text.match(/(前|最近)(\d+)天/);
                const days = parseInt(m2[2]);
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate()-days, 0, 0, 0, 0);
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                label = `最近${days}天`; matchedStr = m2[0];
            }
            // "最近一周" / "近一周"
            else if(text.match(/(最近|近)一周/)) {
                const m2 = text.match(/(最近|近)一周/);
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate()-7, 0, 0, 0, 0);
                end = new Date(now); end.setHours(23,59,59,999);
                label = "最近一周"; matchedStr = m2[0];
            }
            else if (text.match(/(本周|这周|上周|周)([一二三四五六日天])/)) {
                const wm = text.match(/(本周|这周|上周|周)([一二三四五六日天])/);
                const dayMap = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':0,'天':0};
                const targetDay = dayMap[wm[2]];
                let base = wm[1] === '上周' ? new Date(now.getTime() - 7*86400000) : now;
                const monday = getMonday(base);
                const offset = targetDay === 0 ? 6 : targetDay - 1;
                start = new Date(monday.getTime() + offset * 86400000);
                start.setHours(0,0,0,0);
                end = new Date(start); end.setHours(23,59,59,999);
                label = wm[0]; matchedStr = wm[0];
            }
            else if (text.includes("本周") || text.includes("这周")) {
                start = getMonday(now);
                end = new Date(now);
                label = "本周"; matchedStr = text.includes("本周") ? "本周" : "这周";
            }
            else if (text.includes("上周")) {
                let lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                start = getMonday(lastWeek);
                end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
                end.setHours(23,59,59,999);
                label = "上周"; matchedStr = "上周";
            }
            else if(text.includes("本月") || text.includes("这个月")) {
                start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                end = new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59, 999);
                label = "本月"; matchedStr = text.includes("本月") ? "本月" : "这个月";
            }
            else if(text.includes("上上个月") || text.includes("上上月")) {
                start = new Date(now.getFullYear(), now.getMonth()-2, 1, 0, 0, 0, 0);
                end = new Date(now.getFullYear(), now.getMonth()-1, 0, 23, 59, 59, 999);
                label = "上上个月"; matchedStr = text.includes("上上个月") ? "上上个月" : "上上月";
            }
            else if(text.includes("上个月") || text.includes("上月")) {
                start = new Date(now.getFullYear(), now.getMonth()-1, 1, 0, 0, 0, 0);
                end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
                label = "上个月"; matchedStr = text.includes("上个月") ? "上个月" : "上月";
            }
            // "最近X个月"
            else if(text.match(/(最近|近)(\d+)个?月/)) {
                const m2 = text.match(/(最近|近)(\d+)个?月/);
                const months = parseInt(m2[2]);
                start = new Date(now.getFullYear(), now.getMonth()-months, now.getDate(), 0, 0, 0, 0);
                end = new Date(now); end.setHours(23,59,59,999);
                label = `最近${months}个月`; matchedStr = m2[0];
            }

            return matchedStr ? { start, end, label, match: matchedStr } : null;
        }

        function parseCategoryForAI(text) {
             const _se = s => s.replace(/[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').trim();
             // 1. Exact category label match (highest priority)
             const allCats = {...EXPENSE_CATS, ...INCOME_CATS};
             const textNoNum = text.replace(/[\d.]+/g, '').replace(/(花了|买了|块钱|块|元)/g, '').trim();
             const textLower = textNoNum.toLowerCase();
             for(let key in allCats) {
                const lb = allCats[key].label;
                const lbNoEmoji = _se(lb);
                const lbLower = lbNoEmoji.toLowerCase();
                if (textNoNum === lb || textNoNum === lbNoEmoji || text.includes(lb) || text.includes(lbNoEmoji)) return { key, ...allCats[key] };
                if (textLower === lbLower || textLower.includes(lbLower) || lbLower.includes(textLower)) return { key, ...allCats[key] };
                if (key.toLowerCase() === textLower) return { key, ...allCats[key] };
             }
             // 2. Check learned category memory
             for (let keyword in catMemory) {
                 if (text.includes(keyword)) {
                     const catKey = catMemory[keyword];
                     const catObj = EXPENSE_CATS[catKey] || INCOME_CATS[catKey];
                     if (catObj) return { key: catKey, ...catObj };
                 }
             }
             // 3. Brand/keyword database
             const BRAND_MAP = {
                 transport: ['打车','滴滴','地铁','公交','加油','高铁','出租','骑车','火车','飞机','高速','停车','过路费','ETC','共享单车','哈啰','青桔','美团单车','曹操','T3','花小猪','首汽','嘀嗒','货拉拉','顺风车','动车','机票','船票','轮渡','Uber'],
                 food: ['吃饭','午餐','晚餐','早餐','夜宵','外卖','奶茶','咖啡','火锅','烧烤','餐','餐饮','饭','面','粉','粥','串','锅','披萨','寿司','汉堡','炸鸡','薯条','沙拉','牛排','拉面','饺子','包子','馒头','炒饭','盖饭','便当','三明治','热狗','鸡翅','烤肉','烤鱼','小龙虾','螺蛳粉','麻辣烫','冒菜','凉皮','肉夹馍','煎饼','烤串','奶盖','果茶','豆浆','馄饨','米线','酸辣粉','卤味','炸酱面','一点点','霸王茶姬','瑞幸','星巴克','蜜雪冰城','茶百道','喜茶','奈雪','库迪','古茗','沪上阿姨','书亦烧仙草','益禾堂','CoCo','鲜茶亮','乐乐茶','茶颜悦色','茶颜','Manner','Tims','Costa','太平洋咖啡','麦当劳','肯德基','必胜客','达美乐','汉堡王','德克士','华莱士','塔斯汀','萨莉亚','海底捞','西贝','呷哺呷哺','巴奴','小龙坎','大龙燚','谭鸭血','杨国福','张亮','觅姐','吉野家','食其家','味千','兰州拉面','沙县','黄焖鸡','美团外卖','饿了么','盒马','叮咚','朴朴','山姆','Costco','水果','零食','蛋糕','面包','甜点','饮料','酸奶','牛奶','啤酒','下午茶','宵夜','聚餐','请客','AA'],
                 shopping: ['淘宝','京东','超市','商场','购物','拼多多','天猫','闲鱼','得物','唯品会','1688','小红书','抖音商城','快手','沃尔玛','永辉','大润发','物美','全家','711','便利蜂','罗森','优衣库','ZARA','H&M','Nike','Adidas','李宁','安踏','衣服','裤子','鞋','包','化妆品','护肤品','口红','香水','日用品','纸巾','洗衣液','牙膏'],
                 entertainment: ['电影','游戏','KTV','酒吧','门票','演唱会','话剧','展览','密室','剧本杀','台球','网吧','Steam','Switch','PS5','Xbox','爱奇艺','优酷','腾讯视频','B站','Netflix','Spotify','网易云','QQ音乐','健身','游泳','瑜伽','球','羽毛球','篮球','足球','旅游','酒店','民宿','景区','迪士尼','环球影城','欢乐谷'],
                 utilities: ['水电','电费','水费','燃气','房租','物业','话费','网费','充值','宽带','有线','暖气','快递','维修','保洁','洗衣','理发','美容','医院','看病','药','体检','保险','挂号','牙','配眼镜','学费','培训','课程','书','考试','证件','签证','罚款','税'],
                 tech: ['游戏','Steam','Switch','PS5','Xbox','手游','网游','充值','点卡','皮肤','战令','月卡','氪金','抽卡','原神','王者荣耀','和平精英','英雄联盟','LOL','米哈游','腾讯游戏','网易游戏','任天堂','PlayStation','Epic','暴雪','EA','育碧']
             };
             for (let cat in BRAND_MAP) {
                 if (BRAND_MAP[cat].some(k => text.includes(k))) return { key: cat, ...EXPENSE_CATS[cat] };
             }
             // 4. Verb-based inference
             if (/^(吃|喝)(了|过|点|顿)?/.test(text) || /(吃了|喝了|吃过|喝过|吃的|喝的)/.test(text)) return { key: 'food', ...EXPENSE_CATS['food'] };
             if (/^(打车|坐车|开车|骑车)/.test(text)) return { key: 'transport', ...EXPENSE_CATS['transport'] };
             if (/^(买了?|逛)/.test(text) && !/(买菜|买饭|买奶茶)/.test(text)) return { key: 'shopping', ...EXPENSE_CATS['shopping'] };
             return null;
        }

        function fuzzyMatchCat(input, txType) {
            const _se = s => s.replace(/[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').trim();
            const allCats = {...EXPENSE_CATS, ...INCOME_CATS};
            const inputClean = _se(input).toLowerCase();
            if (!inputClean) return null;
            let best = null, bestDist = Infinity;
            for (let key in allCats) {
                const lb = _se(allCats[key].label).toLowerCase();
                if (!lb) continue;
                const dist = levenshtein(inputClean, lb);
                if (dist <= 1 && dist < bestDist) { best = { key, ...allCats[key] }; bestDist = dist; }
            }
            return best;
        }

        function levenshtein(a, b) {
            if (a === b) return 0;
            if (!a.length) return b.length;
            if (!b.length) return a.length;
            const matrix = [];
            for (let i = 0; i <= b.length; i++) matrix[i] = [i];
            for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
            for (let i = 1; i <= b.length; i++) {
                for (let j = 1; j <= a.length; j++) {
                    matrix[i][j] = b[i-1] === a[j-1] ? matrix[i-1][j-1] : Math.min(matrix[i-1][j-1]+1, matrix[i][j-1]+1, matrix[i-1][j]+1);
                }
            }
            return matrix[b.length][a.length];
        }

        function learnCategory(desc, catKey) {
            if (!desc || desc.length < 2 || desc.length > 8) return;
            const allLabels = Object.values({...EXPENSE_CATS, ...INCOME_CATS}).map(c => c.label);
            if (allLabels.includes(desc)) return;
            catMemory[desc] = catKey;
            nfStorage.setItem('cat_memory', JSON.stringify(catMemory));
        }

        // === Feature 3: Undo ===
        function pushUndo(action, data) {
            undoStack.push({action, data, timestamp: Date.now()});
            if (undoStack.length > 20) undoStack.shift();
        }

        // === Feature 4: Budget check after recording ===
        function checkBudgetAfterRecord(cat, type) {
            if (type !== 'expense' || !budgets[cat]) return '';
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const spent = txs.filter(t => t.type === 'expense' && t.cat === cat && new Date(t.date) >= monthStart)
                             .reduce((s, t) => s + t.amount, 0);
            const budget = budgets[cat];
            const catLabel = t('cat_' + cat) || (EXPENSE_CATS[cat] || {label:cat}).label;
            if (spent > budget) {
                return `<br><span class="text-[#e84393] text-xs"><i data-lucide="alert-triangle" class="w-3 h-3 inline-block"></i> ${catLabel} ${t('budget_over') || '已超预算'}！${spent.toLocaleString()} / ${budget.toLocaleString()}</span>`;
            } else if (spent > budget * 0.8) {
                const remain = budget - spent;
                return `<br><span class="text-[#e84393] text-xs"><i data-lucide="alert-circle" class="w-3 h-3 inline-block"></i> ${catLabel} ${t('budget_warning') || '预算剩余'}${remain.toLocaleString()}</span>`;
            }
            return '';
        }

        // === Feature 8: Anomaly detection ===
        function checkAnomaly(amount, cat) {
            const now = new Date();
            const past30 = new Date(now.getTime() - 30*24*60*60*1000);
            const recent = txs.filter(t => t.type === 'expense' && new Date(t.date) >= past30 && t.cat === cat);
            if (recent.length < 3) return '';
            const avg = recent.reduce((s,t) => s+t.amount, 0) / recent.length;
            if (amount > avg * 3 && amount > 100) {
                const ratio = (amount/avg).toFixed(1);
                const msg = currentLang === 'zh' ? `这笔消费是该分类近期均值的${ratio}倍，确认金额正确吗？`
                    : currentLang === 'en' ? `This is ${ratio}x the recent average for this category. Correct amount?`
                    : currentLang === 'ja' ? `このカテゴリの最近の平均の${ratio}倍です。金額は正しいですか？`
                    : `이 카테고리 최근 평균의 ${ratio}배입니다. 금액이 맞나요?`;
                return `<br><span class="text-[#e84393] text-xs"><i data-lucide="trending-up" class="w-3 h-3 inline-block"></i> ${msg}</span>`;
            }
            return '';
        }

        // === Feature 9: Shortcut suggestion ===
        function checkShortcutSuggestion(desc, amount, cat) {
            const similar = txs.filter(t => t.desc === desc && t.amount === amount && t.cat === cat);
            if (similar.length >= 2 && !shortcuts[desc]) {
                const tip = currentLang === 'zh' ? `"${desc}"已记录${similar.length}次相同金额，说"设为快捷 ${desc}"下次可快速记账`
                    : currentLang === 'en' ? `"${desc}" recorded ${similar.length} times with same amount. Say "set shortcut ${desc}" for quick entry`
                    : currentLang === 'ja' ? `「${desc}」同額${similar.length}回記録。「ショートカット設定 ${desc}」で次回から簡単に`
                    : `"${desc}" 동일 금액 ${similar.length}회 기록. "바로가기 설정 ${desc}"로 빠른 입력`;
                return `<br><span class="text-white/60 text-xs"><i data-lucide="zap" class="w-3 h-3 inline-block"></i> ${tip}</span>`;
            }
            return '';
        }

        // === Feature 10: 消费吐槽 ===
        function getSpendingRoast(cat, amount, desc) {
            const now = new Date();
            const h = now.getHours();
            const monthTxs = txs.filter(t => t.type === 'expense' && t.cat === cat && new Date(t.date).getMonth() === now.getMonth());
            const catCount = monthTxs.length;
            const catLabel = (EXPENSE_CATS[cat] || {label: desc}).label;

            const roasts = {
                zh: {
                    night: ['深夜冲动消费，钱包表示已读不回', '这个点还在花钱？明天的你会后悔的', '夜间经济活动频繁，建议立刻睡觉'],
                    highFreq: [`这个月第${catCount}次${catLabel}了，钱包已经麻木了`, `又是${catLabel}，你和它的关系比和存款的关系还稳定`, `${catLabel}消费已成肌肉记忆`],
                    bigSpend: ['大手一挥，贫穷向你招手', '这笔花出去的钱，需要吃多少天泡面才能省回来', '钱：我们到此为止吧'],
                    smallSpend: ['蚊子腿也是肉，记下了', '不积小流，无以成大额支出'],
                    food: ['吃饱了才有力气省钱', '胃：谢谢。钱包：告辞', '这顿饭钱够买多少包泡面你算过吗'],
                    transport: ['腿：我不存在是吧', '打车一时爽，月底火葬场', '钱都花在路上了，人还在原地'],
                    shopping: ['购物使人快乐，账单使人清醒', '买的时候觉得值，还花呗的时候觉得不值'],
                },
                en: {
                    night: ['Late night spending? Your wallet is crying in its sleep', 'Nothing good happens after midnight... especially for your balance', 'Night owl economics: spend now, regret later'],
                    highFreq: [`${catLabel} for the ${catCount}th time this month. It's a lifestyle at this point`, `You and ${catLabel} - more committed than most relationships`, `${catLabel} again? Autopilot spending detected`],
                    bigSpend: ['Big spender alert. Your savings account just fainted', 'This purchase required a moment of silence for your wallet', 'Money: "It\'s not you, it\'s me... I\'m leaving"'],
                    smallSpend: ['Every penny counts... right into the void', 'Small but mighty drain on the wallet'],
                    food: ['Eating well is self-care. Your wallet disagrees', 'Stomach: happy. Bank account: concerned'],
                    transport: ['Your legs called. They feel neglected', 'Getting there fast, going broke faster'],
                    shopping: ['Retail therapy: where happiness has a price tag', 'Shopping cart: full. Savings: empty'],
                },
                ja: {
                    night: ['深夜のお買い物は明日の後悔の種', '寝る前に散財、翌朝の自分が泣く', 'この時間にまだ使うの？おやすみなさい'],
                    highFreq: [`今月${catCount}回目の${catLabel}。もう習慣だね`, `また${catLabel}？財布がため息ついてるよ`],
                    bigSpend: ['大盤振る舞いだね、残高が震えてる', 'この一発で何日分のカップ麺が買えたか'],
                    smallSpend: ['チリも積もれば山となる', '小さな出費もちゃんと記録、偉い'],
                    food: ['食べないと生きられないけど、食費やばいよ', '胃は満足、財布は不満'],
                    transport: ['足：私の存在意義って...', '移動費にどんだけ使うの'],
                    shopping: ['買い物は楽しい、明細は悲しい'],
                },
                ko: {
                    night: ['심야 소비는 내일의 후회', '이 시간에 돈 쓰는 건 지갑에 대한 테러'],
                    highFreq: [`이번 달 ${catCount}번째 ${catLabel}. 습관이 됐네`, `또 ${catLabel}? 통장이 울고 있어`],
                    bigSpend: ['큰 손이시네요, 잔고가 떨고 있어요', '이 돈이면 라면 몇 개 살 수 있는지 아세요?'],
                    smallSpend: ['티끌 모아 태산... 지출도 마찬가지', '작은 금액도 기록하는 당신, 훌륭해요'],
                    food: ['맛있게 먹었으면 됐지만, 지갑은 아프다', '위장: 감사. 통장: 작별'],
                    transport: ['다리: 나 무시하는 거야?', '택시비로 이번 달 얼마 쓴 건지...'],
                    shopping: ['쇼핑은 행복, 카드값은 현실'],
                },
            };
            const lang = roasts[currentLang] || roasts.zh;
            let pool = [];
            if (h >= 0 && h < 6) pool = lang.night || [];
            else if (catCount >= 5) pool = lang.highFreq || [];
            else if (amount >= 500) pool = lang.bigSpend || [];
            else if (amount <= 10) pool = lang.smallSpend || [];
            else if (cat === 'food' || cat === 'dining') pool = lang.food || [];
            else if (cat === 'transport') pool = lang.transport || [];
            else if (cat === 'shopping') pool = lang.shopping || [];

            if (pool.length === 0) return '';
            const roast = pool[Math.floor(Math.random() * pool.length)];
            return `<br><span class="text-white/40 text-xs italic">${roast}</span>`;
        }

        // === Feature 11: 月报/总结 ===
        function generateSummary() {
            const now = new Date();
            const ms = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthTxs = txs.filter(t => t.type === 'expense' && new Date(t.date) >= ms);
            const totalSpent = monthTxs.reduce((s, t) => s + t.amount, 0);
            const income = txs.filter(t => t.type === 'income' && new Date(t.date) >= ms).reduce((s, t) => s + t.amount, 0);

            // 分类统计
            const catMap = {};
            monthTxs.forEach(t => { catMap[t.cat] = (catMap[t.cat] || 0) + t.amount; });
            const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
            const topCat = sorted[0];
            const topLabel = topCat ? ((EXPENSE_CATS[topCat[0]] || {}).label || topCat[0]) : '-';
            const topPct = topCat ? Math.round(topCat[1] / totalSpent * 100) : 0;

            // 最大单笔
            const biggest = monthTxs.length > 0 ? monthTxs.reduce((max, t) => t.amount > max.amount ? t : max, monthTxs[0]) : null;

            // 日均
            const daysInMonth = now.getDate();
            const dailyAvg = Math.round(totalSpent / daysInMonth);

            // 同比上月
            const prevMs = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const prevMe = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            const prevTotal = txs.filter(t => t.type === 'expense' && new Date(t.date) >= prevMs && new Date(t.date) <= prevMe).reduce((s, t) => s + t.amount, 0);
            const vsLastMonth = prevTotal > 0 ? Math.round((totalSpent - prevTotal) / prevTotal * 100) : null;

            // 预测
            const predicted = Math.round(dailyAvg * new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
            const overBudget = totalBudget > 0 ? predicted - totalBudget : null;

            const labels = {
                zh: { title: '📊 本月总结', spent: '总支出', income: '收入', net: '净收支', top: '最大分类', biggest: '最大单笔', daily: '日均', vs: '同比上月', predict: '预计月末', over: '将超预算', under: '预算内', days: '记账天数', comment: '' },
                en: { title: '📊 Monthly Summary', spent: 'Total Spent', income: 'Income', net: 'Net', top: 'Top Category', biggest: 'Biggest', daily: 'Daily Avg', vs: 'vs Last Month', predict: 'Month-end Forecast', over: 'Over budget by', under: 'Within budget', days: 'Active Days', comment: '' },
                ja: { title: '📊 今月のまとめ', spent: '総支出', income: '収入', net: '収支', top: '最大カテゴリ', biggest: '最大の一件', daily: '日平均', vs: '先月比', predict: '月末予測', over: '予算超過', under: '予算内', days: '記帳日数', comment: '' },
                ko: { title: '📊 이번 달 요약', spent: '총 지출', income: '수입', net: '순수입', top: '최다 카테고리', biggest: '최대 단건', daily: '일평균', vs: '전월 대비', predict: '월말 예상', over: '예산 초과', under: '예산 내', days: '기록 일수', comment: '' },
            };
            const l = labels[currentLang] || labels.zh;

            // 记账天数
            const activeDays = new Set(monthTxs.map(t => { const d = new Date(t.date); return `${d.getMonth()+1}-${d.getDate()}`; })).size;

            let html = `<span class="text-white font-bold">${l.title}</span><br><br>`;
            html += `${l.spent}: <span class="text-teal-neon font-num font-bold">${totalSpent.toLocaleString()}</span><br>`;
            if (income > 0) html += `${l.income}: <span class="text-green-400 font-num">+${income.toLocaleString()}</span> · ${l.net}: <span class="font-num">${(income - totalSpent).toLocaleString()}</span><br>`;
            html += `${l.top}: ${topLabel} (${topPct}%)<br>`;
            if (biggest) html += `${l.biggest}: ${biggest.desc} <span class="font-num">${biggest.amount.toLocaleString()}</span><br>`;
            html += `${l.daily}: <span class="font-num">${dailyAvg.toLocaleString()}</span> · ${l.days}: ${activeDays}<br>`;
            if (vsLastMonth !== null) html += `${l.vs}: <span class="${vsLastMonth > 0 ? 'text-red-400' : 'text-green-400'}">${vsLastMonth > 0 ? '+' : ''}${vsLastMonth}%</span><br>`;
            html += `${l.predict}: <span class="font-num">${predicted.toLocaleString()}</span>`;
            if (overBudget !== null) html += ` · ${overBudget > 0 ? `<span class="text-red-400">${l.over} ${overBudget.toLocaleString()}</span>` : `<span class="text-green-400">${l.under}</span>`}`;

            // 一句话评价
            const comments = {
                zh: totalSpent === 0 ? '本月零支出，冷静得可怕' : topPct > 60 ? `${topLabel}占比过高，建议适当分散` : vsLastMonth > 30 ? '本月花销飙升，注意控制节奏' : vsLastMonth < -20 ? '本月控制得不错，继续保持' : '消费结构相对均衡',
                en: totalSpent === 0 ? 'Zero spending. Impressive... or concerning' : topPct > 60 ? `${topLabel} dominates. Consider diversifying` : vsLastMonth > 30 ? 'Spending surged this month. Watch the pace' : vsLastMonth < -20 ? 'Good control this month. Keep it up' : 'Balanced spending structure',
                ja: totalSpent === 0 ? '今月はゼロ支出。すごいか心配か' : topPct > 60 ? `${topLabel}が多すぎ。バランスを` : vsLastMonth > 30 ? '今月は出費急増。ペース注意' : vsLastMonth < -20 ? '今月はよくコントロールできてる' : 'バランスの取れた支出構造',
                ko: totalSpent === 0 ? '이번 달 지출 제로. 대단하거나 걱정되거나' : topPct > 60 ? `${topLabel} 비중 과다. 분산 필요` : vsLastMonth > 30 ? '이번 달 지출 급증. 속도 조절 필요' : vsLastMonth < -20 ? '이번 달 잘 절제했어요' : '균형 잡힌 소비 구조',
            };
            html += `<br><br><span class="text-white/50 italic text-xs">${(comments[currentLang] || comments.zh)}</span>`;
            return html;
        }

        // === Feature 12: 对话式查询 ===
        function handleQuery(text) {
            const now = new Date();
            const ms = new Date(now.getFullYear(), now.getMonth(), 1);

            // "这个月XX花了多少"
            const catQueryMatch = text.match(/(这个月|本月|这月)(.+?)(花了多少|多少钱|消费|支出|花了)/);
            if (catQueryMatch) {
                const keyword = catQueryMatch[2].trim();
                const allCats = {...EXPENSE_CATS, ...INCOME_CATS};
                let matchKey = null;
                for (let k in allCats) { if (allCats[k].label === keyword) { matchKey = k; break; } }
                const filtered = txs.filter(t => {
                    if (new Date(t.date) < ms) return false;
                    if (matchKey) return t.cat === matchKey;
                    return t.desc.includes(keyword) || (allCats[t.cat] || {}).label === keyword;
                });
                const total = filtered.reduce((s, t) => s + t.amount, 0);
                const count = filtered.length;
                if (count === 0) return { matched: true, response: currentLang === 'zh' ? `本月没有"${keyword}"相关的消费记录` : `No "${keyword}" records this month` };
                const resp = currentLang === 'zh' ? `本月「${keyword}」共 <span class="text-teal-neon font-num font-bold">${total.toLocaleString()}</span> 元，${count}笔` :
                    currentLang === 'en' ? `"${keyword}" this month: <span class="text-teal-neon font-num font-bold">${total.toLocaleString()}</span>, ${count} entries` :
                    currentLang === 'ja' ? `今月の「${keyword}」合計 <span class="text-teal-neon font-num font-bold">${total.toLocaleString()}</span>、${count}件` :
                    `이번 달 "${keyword}" 합계 <span class="text-teal-neon font-num font-bold">${total.toLocaleString()}</span>, ${count}건`;
                return { matched: true, response: resp };
            }

            // "今天/昨天/这周花了多少"
            const periodMatch = text.match(/(今天|昨天|这周|本周|上周)(花了多少|花了|消费|支出|多少钱)/);
            if (periodMatch) {
                const period = periodMatch[1];
                let start, end = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                if (period === '今天') { start = today; }
                else if (period === '昨天') { start = new Date(today.getTime() - 86400000); end = today; }
                else if (period === '这周' || period === '本周') { const dow = now.getDay() || 7; start = new Date(today.getTime() - (dow - 1) * 86400000); }
                else if (period === '上周') { const dow = now.getDay() || 7; const thisWeekStart = new Date(today.getTime() - (dow - 1) * 86400000); start = new Date(thisWeekStart.getTime() - 7 * 86400000); end = thisWeekStart; }
                const filtered = txs.filter(t => t.type === 'expense' && new Date(t.date) >= start && new Date(t.date) < (period === '今天' || period === '这周' || period === '本周' ? new Date(end.getTime() + 86400000) : end));
                const total = filtered.reduce((s, t) => s + t.amount, 0);
                return { matched: true, response: `${period}消费 <span class="text-teal-neon font-num font-bold">${total.toLocaleString()}</span> 元，${filtered.length}笔` };
            }

            // English queries: "how much did I spend on X" / "how much this week"
            const enCatQuery = text.match(/how much.*(spend|spent).*(on|for)\s+(.+)/i);
            if (enCatQuery) {
                const keyword = enCatQuery[3].trim().replace(/[?？]/, '');
                const filtered = txs.filter(t => new Date(t.date) >= ms && (t.desc.toLowerCase().includes(keyword.toLowerCase()) || ((EXPENSE_CATS[t.cat]||{}).label||'').toLowerCase() === keyword.toLowerCase()));
                const total = filtered.reduce((s, t) => s + t.amount, 0);
                return { matched: true, response: `You spent <span class="text-teal-neon font-num font-bold">${total.toLocaleString()}</span> on "${keyword}" this month (${filtered.length} entries)` };
            }
            const enPeriodQuery = text.match(/how much.*(today|yesterday|this week)/i);
            if (enPeriodQuery) {
                const p = enPeriodQuery[1].toLowerCase();
                const today2 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                let s2 = today2, e2 = new Date(today2.getTime() + 86400000);
                if (p === 'yesterday') { s2 = new Date(today2.getTime() - 86400000); e2 = today2; }
                else if (p === 'this week') { const dow = now.getDay() || 7; s2 = new Date(today2.getTime() - (dow-1)*86400000); e2 = new Date(today2.getTime() + 86400000); }
                const filtered = txs.filter(t => t.type === 'expense' && new Date(t.date) >= s2 && new Date(t.date) < e2);
                const total = filtered.reduce((s, t) => s + t.amount, 0);
                return { matched: true, response: `Spent <span class="text-teal-neon font-num font-bold">${total.toLocaleString()}</span> ${p} (${filtered.length} entries)` };
            }

            return { matched: false };
        }

        // === Feature 13: 消费预测 ===
        function getSpendingForecast() {
            const now = new Date();
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const daysPassed = now.getDate();
            const ms = new Date(now.getFullYear(), now.getMonth(), 1);
            const spent = txs.filter(t => t.type === 'expense' && new Date(t.date) >= ms).reduce((s, t) => s + t.amount, 0);
            const dailyAvg = spent / daysPassed;
            const predicted = Math.round(dailyAvg * daysInMonth);
            const remaining = daysInMonth - daysPassed;

            const labels = {
                zh: { title: '🔮 消费预测', pace: '当前节奏', daily: '日均', predict: '月末预计', remain: '剩余天数', safe: '安全日均额度', over: '将超预算', under: '预算安全' },
                en: { title: '🔮 Spending Forecast', pace: 'Current pace', daily: 'Daily avg', predict: 'Month-end forecast', remain: 'Days left', safe: 'Safe daily limit', over: 'Over budget by', under: 'Within budget' },
                ja: { title: '🔮 支出予測', pace: '現在のペース', daily: '日平均', predict: '月末予測', remain: '残り日数', safe: '安全な日額', over: '予算超過', under: '予算内' },
                ko: { title: '🔮 지출 예측', pace: '현재 속도', daily: '일평균', predict: '월말 예상', remain: '남은 일수', safe: '안전 일일 한도', over: '예산 초과', under: '예산 내' },
            };
            const l = labels[currentLang] || labels.zh;
            let html = `<span class="text-white font-bold">${l.title}</span><br><br>`;
            html += `${l.daily}: <span class="font-num">${Math.round(dailyAvg).toLocaleString()}</span><br>`;
            html += `${l.predict}: <span class="text-teal-neon font-num font-bold">${predicted.toLocaleString()}</span><br>`;
            html += `${l.remain}: ${remaining}<br>`;
            if (totalBudget > 0) {
                const budgetLeft = totalBudget - spent;
                const safeDailyLimit = remaining > 0 ? Math.round(budgetLeft / remaining) : 0;
                html += `${l.safe}: <span class="font-num ${safeDailyLimit < 0 ? 'text-red-400' : 'text-green-400'}">${safeDailyLimit.toLocaleString()}</span><br>`;
                if (predicted > totalBudget) html += `<span class="text-red-400">${l.over} ${(predicted - totalBudget).toLocaleString()}</span>`;
                else html += `<span class="text-green-400">${l.under}</span>`;
            }
            return html;
        }

        function parseCnNumber(str) {
            const cnMap = {'零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'百':100,'千':1000,'万':10000,'亿':100000000};
            const m = str.match(/[零一二两三四五六七八九十百千万亿半]+/);
            if (!m) return 0;
            const s = m[0];
            let yi = 0, wan = 0, section = 0, current = 0, lastHighUnit = 0;
            for (let i = 0; i < s.length; i++) {
                const c = s[i];
                if (c === '半') { current = 0.5; continue; }
                const v = cnMap[c];
                if (v === undefined) return 0;
                if (v === 100000000) {
                    yi = (yi + wan + section + current) * v;
                    wan = 0; section = 0; current = 0; lastHighUnit = v;
                } else if (v === 10000) {
                    wan = (wan + section + current) * v;
                    section = 0; current = 0; lastHighUnit = v;
                } else if (v >= 10) {
                    section += (current || 1) * v;
                    current = 0; lastHighUnit = v;
                } else {
                    current = v;
                }
            }
            if (current > 0 && current < 10 && lastHighUnit >= 100) {
                return yi + wan + section + current * (lastHighUnit / 10);
            }
            return yi + wan + section + current;
        }

        const aiMsg = {
            zh: {
                confirmed: '已确认。', cancelled: '已取消操作。', confirm_prompt: '请回复"确认"继续，或"取消"放弃', enter_amount: '请输入金额数字，如：38',
                no_undo: '没有可撤回的操作。', undone: '已撤回。',
                no_export_data: '没有可导出的数据。', exported: (n) => `已导出 ${n} 条记录（CSV + 图片）`,
                no_match: '没有找到符合条件的记录。', not_found: '未找到匹配的记录。',
                no_last_tx: '没有找到上一条记录，请先记一笔或指明要修改哪条。',
                specify_change: '请说明要改成什么，如：这个名字换成午餐',
                not_found_modify: '未找到要修改的记录，请说清楚哪一笔（如：修改昨天打车金额为25）',
                specify_what: '请说明要改什么，如：修改打车金额为25',
                no_recurring_match: '没有找到匹配的自动记账规则。',
                no_recurring: '当前没有设置任何自动记账。',
                budget_deleted: '已删除该预算。', no_budget_found: '没有找到对应预算。',
                specify_budget: '请指定预算金额，如：设置餐饮预算1500',
                shortcut_prompt: '请说明快捷词，如：设为快捷 星巴克',
                no_shortcut_tx: '没有找到可设为快捷的记录。',
                shortcut_not_found: '未找到该快捷词。',
                fallback: '没听清... 您可以说：<br>• "打车18" 记一笔<br>• "本月餐饮花了多少" 查询<br>• "今天花了多少" 按时段查<br>• "总结" 月度报告<br>• "预测" 消费预测<br>• "撤回" 撤销上一步',
                batch_deleted: (n) => `已确认删除 ${n} 条记录。`,
                undo_record: (desc, amt) => `已撤回：记录 "${desc}" ${amt}`,
                undo_restore: (desc, amt) => `已恢复：记录 "${desc}" ${amt}`,
                undo_batch: (n) => `已撤回批量删除，恢复了 ${n} 条记录。`,
                undo_modify: (desc) => `已撤回修改，恢复 "${desc}"`,
                ask_amount: (cat) => `记${cat}，金额多少？`,
                income_label: '收入', expense_label: '支出',
                deleted_single: (date, desc, amt) => `已删除：${date} 的 "${desc}" ${amt}<br><span class="text-white/35 text-xs">说"撤回"可恢复</span>`,
                will_delete: (count, scope, total) => `即将删除 <span class="text-xl font-bold font-num text-white">${count}</span> 条记录（${scope}，合计 ${total}）<br><span class="text-[#e84393] text-xs">回复"确认"执行，或"取消"放弃</span>`,
                query_result: (timeStr, catStr, typeStr, total) => `${timeStr}${catStr}总${typeStr} <span class="text-xl font-bold font-num text-white">${total}</span>`,
                query_no_data: (timeStr, catStr, typeStr) => `${timeStr}没有找到${catStr}相关的${typeStr}记录。`,
                modified_last: (changes) => `已修改上一条：${changes}`,
                modified_target: (desc, changes) => `已修改 "${desc}"：${changes}`,
                amount_to: (v) => `金额→${v}`, desc_to: (v) => `备注→${v}`, cat_to: (v) => `分类→${v}`, name_to: (v) => `名称→"${v}"`,
                recurring_set: (freq, desc, amt, cat) => `已设置${freq}自动记账：${desc} <span class="text-teal-neon font-num">${amt}</span> [${cat}]<br><span class="text-xs text-white/60">本次已自动记入，之后${freq}自动添加</span>`,
                recurring_cancelled: (desc, amt) => `已取消自动记账："${desc}" ${amt}`,
                recurring_list_title: '当前自动记账规则：',
                freq_monthly: '每月', freq_weekly: '每周', freq_daily: '每天',
                shortcut_used: (desc, amt) => `快捷记账：${desc} <span class="text-teal-neon font-num">${amt}</span>`,
                shortcut_set: (keyword, desc, amt) => `已设置快捷：说"${keyword}"将自动记录 ${desc} ${amt}`,
                shortcut_empty: '当前没有快捷记账。',
                shortcut_list_title: '快捷记账列表：',
                last_record: (keyword, date, desc, amt) => `上次${keyword}：${date} "${desc}" <span class="text-white font-num font-bold">${amt}</span>`,
                not_found_keyword: (keyword) => `没有找到"${keyword}"相关的记录。`,
                insight_title: '消费洞察',
                insight_week_high: (amt, pct) => `本周支出${amt}，比上周高${pct}%`,
                insight_cat_spike: (label, amt, times) => `${label}本周花了${amt}，是上周的${times}倍`,
                insight_normal: '本周消费正常，没有异常波动',
                budget_set_ai: (label, amt) => `已设置${label}月预算 <span class="text-white font-num font-bold">${amt}</span>`,
                budget_none: '还没设置预算。',
                budget_status_title: '本月预算情况：'
            },
            en: {
                confirmed: 'Confirmed.', cancelled: 'Cancelled.', confirm_prompt: 'Reply "confirm" to proceed or "cancel" to abort', enter_amount: 'Please enter an amount, e.g. 38',
                no_undo: 'Nothing to undo.', undone: 'Done.',
                no_export_data: 'No data to export.', exported: (n) => `Exported ${n} records (CSV + image)`,
                no_match: 'No matching records found.', not_found: 'No matching records.',
                no_last_tx: 'No recent record found. Please add one first or specify which to modify.',
                specify_change: 'Please specify what to change, e.g. "change name to lunch"',
                not_found_modify: 'Record not found. Please be more specific.',
                specify_what: 'Please specify what to change, e.g. "change transport amount to 25"',
                no_recurring_match: 'No matching recurring rule found.',
                no_recurring: 'No recurring rules set.',
                budget_deleted: 'Budget removed.', no_budget_found: 'No matching budget found.',
                specify_budget: 'Please specify budget amount, e.g. "set food budget 1500"',
                shortcut_prompt: 'Please specify a keyword, e.g. "set shortcut Starbucks"',
                no_shortcut_tx: 'No record available for shortcut.',
                shortcut_not_found: 'Shortcut not found.',
                fallback: 'Try saying:<br>• "taxi 18" to add<br>• "how much on food this month" to query<br>• "how much today" for daily total<br>• "summary" for monthly report<br>• "forecast" for predictions<br>• "undo" to revert',
                batch_deleted: (n) => `Deleted ${n} records.`,
                undo_record: (desc, amt) => `Undone: "${desc}" ${amt}`,
                undo_restore: (desc, amt) => `Restored: "${desc}" ${amt}`,
                undo_batch: (n) => `Restored ${n} records.`,
                undo_modify: (desc) => `Reverted changes to "${desc}"`,
                ask_amount: (cat) => `Adding ${cat}, how much?`,
                income_label: 'Income', expense_label: 'Expense',
                deleted_single: (date, desc, amt) => `Deleted: ${date} "${desc}" ${amt}<br><span class="text-white/35 text-xs">Say "undo" to restore</span>`,
                will_delete: (count, scope, total) => `About to delete <span class="text-xl font-bold font-num text-white">${count}</span> records (${scope}, total ${total})<br><span class="text-[#e84393] text-xs">Reply "confirm" to proceed or "cancel" to abort</span>`,
                query_result: (timeStr, catStr, typeStr, total) => `${timeStr}${catStr} total ${typeStr}: <span class="text-xl font-bold font-num text-white">${total}</span>`,
                query_no_data: (timeStr, catStr, typeStr) => `No ${typeStr} records found${catStr ? ' for '+catStr : ''}${timeStr ? ' in '+timeStr : ''}.`,
                modified_last: (changes) => `Modified last entry: ${changes}`,
                modified_target: (desc, changes) => `Modified "${desc}": ${changes}`,
                amount_to: (v) => `Amount→${v}`, desc_to: (v) => `Note→${v}`, cat_to: (v) => `Category→${v}`, name_to: (v) => `Name→"${v}"`,
                recurring_set: (freq, desc, amt, cat) => `Set ${freq} auto-record: ${desc} <span class="text-teal-neon font-num">${amt}</span> [${cat}]<br><span class="text-xs text-white/60">Recorded now, will repeat ${freq}</span>`,
                recurring_cancelled: (desc, amt) => `Cancelled auto-record: "${desc}" ${amt}`,
                recurring_list_title: 'Current recurring rules:',
                freq_monthly: 'Monthly', freq_weekly: 'Weekly', freq_daily: 'Daily',
                shortcut_used: (desc, amt) => `Quick record:${desc} <span class="text-teal-neon font-num">${amt}</span>`,
                shortcut_set: (keyword, desc, amt) => `Shortcut set: say "${keyword}" to auto-record ${desc} ${amt}`,
                shortcut_empty: 'No shortcuts set.',
                shortcut_list_title: 'Shortcuts:',
                last_record: (keyword, date, desc, amt) => `Last ${keyword}: ${date} "${desc}" <span class="text-white font-num font-bold">${amt}</span>`,
                not_found_keyword: (keyword) => `No records found for "${keyword}".`,
                insight_title: 'Spending Insight',
                insight_week_high: (amt, pct) => `This week: ${amt}, ${pct}% higher than last week`,
                insight_cat_spike: (label, amt, times) => `${label} this week: ${amt}, ${times}x last week`,
                insight_normal: 'Spending looks normal this week',
                budget_set_ai: (label, amt) => `Set ${label} monthly budget: <span class="text-white font-num font-bold">${amt}</span>`,
                budget_none: 'No budgets set yet.',
                budget_status_title: 'Monthly budget status:'
            },
            ja: {
                confirmed: '確認しました。', cancelled: 'キャンセルしました。', confirm_prompt: '「確認」で続行、「キャンセル」で中止', enter_amount: '金額を入力してください（例：38）',
                no_undo: '元に戻す操作がありません。', undone: '元に戻しました。',
                no_export_data: 'エクスポートするデータがありません。', exported: (n) => `${n}件をエクスポートしました（CSV + 画像）`,
                no_match: '該当する記録が見つかりません。', not_found: '一致する記録がありません。',
                no_last_tx: '直近の記録が見つかりません。先に記録するか、修正対象を指定してください。',
                specify_change: '変更内容を指定してください（例：名前をランチに変更）',
                not_found_modify: '記録が見つかりません。詳しく指定してください。',
                specify_what: '何を変更するか指定してください（例：交通費を25に変更）',
                no_recurring_match: '該当する自動記帳ルールが見つかりません。',
                no_recurring: '自動記帳ルールは未設定です。',
                budget_deleted: '予算を削除しました。', no_budget_found: '該当する予算がありません。',
                specify_budget: '予算金額を指定してください（例：食費予算1500を設定）',
                shortcut_prompt: 'キーワードを指定してください（例：ショートカット設定 スタバ）',
                no_shortcut_tx: 'ショートカットに使える記録がありません。',
                shortcut_not_found: 'ショートカットが見つかりません。',
                fallback: '例えば：<br>• "タクシー18" で記録<br>• "今月の食費いくら" で照会<br>• "今日いくら" で日計<br>• "まとめ" でレポート<br>• "予測" で支出予測<br>• "戻す" で取り消し',
                batch_deleted: (n) => `${n}件を削除しました。`,
                undo_record: (desc, amt) => `取消：「${desc}」${amt}`,
                undo_restore: (desc, amt) => `復元：「${desc}」${amt}`,
                undo_batch: (n) => `${n}件を復元しました。`,
                undo_modify: (desc) => `「${desc}」の変更を元に戻しました`,
                ask_amount: (cat) => `${cat}を記録、金額は？`,
                income_label: '収入', expense_label: '支出',
                deleted_single: (date, desc, amt) => `削除：${date}「${desc}」${amt}<br><span class="text-white/35 text-xs">「戻す」で復元</span>`,
                will_delete: (count, scope, total) => `<span class="text-xl font-bold font-num text-white">${count}</span>件を削除します（${scope}、合計${total}）<br><span class="text-[#e84393] text-xs">「確認」で実行、「キャンセル」で中止</span>`,
                query_result: (timeStr, catStr, typeStr, total) => `${timeStr}${catStr}${typeStr}合計：<span class="text-xl font-bold font-num text-white">${total}</span>`,
                query_no_data: (timeStr, catStr, typeStr) => `${timeStr}${catStr}の${typeStr}記録が見つかりません。`,
                modified_last: (changes) => `前回を修正：${changes}`,
                modified_target: (desc, changes) => `「${desc}」を修正：${changes}`,
                amount_to: (v) => `金額→${v}`, desc_to: (v) => `メモ→${v}`, cat_to: (v) => `カテゴリ→${v}`, name_to: (v) => `名前→「${v}」`,
                recurring_set: (freq, desc, amt, cat) => `${freq}自動記帳を設定：${desc} <span class="text-teal-neon font-num">${amt}</span> [${cat}]<br><span class="text-xs text-white/60">今回記録済み、以降${freq}自動追加</span>`,
                recurring_cancelled: (desc, amt) => `自動記帳を取消：「${desc}」${amt}`,
                recurring_list_title: '現在の自動記帳ルール：',
                freq_monthly: '毎月', freq_weekly: '毎週', freq_daily: '毎日',
                shortcut_used: (desc, amt) => `クイック記録：${desc} <span class="text-teal-neon font-num">${amt}</span>`,
                shortcut_set: (keyword, desc, amt) => `ショートカット設定：「${keyword}」で ${desc} ${amt} を自動記録`,
                shortcut_empty: 'ショートカットは未設定です。',
                shortcut_list_title: 'ショートカット一覧：',
                last_record: (keyword, date, desc, amt) => `前回の${keyword}：${date}「${desc}」<span class="text-white font-num font-bold">${amt}</span>`,
                not_found_keyword: (keyword) => `「${keyword}」の記録が見つかりません。`,
                insight_title: '消費分析',
                insight_week_high: (amt, pct) => `今週の支出${amt}、先週より${pct}%高い`,
                insight_cat_spike: (label, amt, times) => `${label}今週${amt}、先週の${times}倍`,
                insight_normal: '今週の消費は正常です',
                budget_set_ai: (label, amt) => `${label}月間予算を設定：<span class="text-white font-num font-bold">${amt}</span>`,
                budget_none: '予算は未設定です。',
                budget_status_title: '今月の予算状況：'
            },
            ko: {
                confirmed: '확인되었습니다.', cancelled: '취소되었습니다.', confirm_prompt: '"확인"으로 계속, "취소"로 중단', enter_amount: '금액을 입력하세요 (예: 38)',
                no_undo: '되돌릴 작업이 없습니다.', undone: '되돌렸습니다.',
                no_export_data: '내보낼 데이터가 없습니다.', exported: (n) => `${n}건 내보내기 완료 (CSV + 이미지)`,
                no_match: '일치하는 기록이 없습니다.', not_found: '일치하는 기록을 찾을 수 없습니다.',
                no_last_tx: '최근 기록이 없습니다. 먼저 기록하거나 수정할 항목을 지정하세요.',
                specify_change: '변경 내용을 지정하세요 (예: 이름을 점심으로 변경)',
                not_found_modify: '기록을 찾을 수 없습니다. 자세히 지정하세요.',
                specify_what: '무엇을 변경할지 지정하세요 (예: 교통비 금액을 25로 변경)',
                no_recurring_match: '일치하는 자동 기록 규칙이 없습니다.',
                no_recurring: '자동 기록 규칙이 없습니다.',
                budget_deleted: '예산이 삭제되었습니다.', no_budget_found: '해당 예산이 없습니다.',
                specify_budget: '예산 금액을 지정하세요 (예: 식비 예산 1500 설정)',
                shortcut_prompt: '키워드를 지정하세요 (예: 바로가기 설정 스타벅스)',
                no_shortcut_tx: '바로가기로 사용할 기록이 없습니다.',
                shortcut_not_found: '바로가기를 찾을 수 없습니다.',
                fallback: '이렇게 말해보세요:<br>• "택시 18" 기록<br>• "이번 달 식비 얼마" 조회<br>• "오늘 얼마 썼어" 일일 합계<br>• "요약" 월간 보고서<br>• "예측" 지출 예측<br>• "되돌리기" 취소',
                batch_deleted: (n) => `${n}건 삭제되었습니다.`,
                undo_record: (desc, amt) => `취소: "${desc}" ${amt}`,
                undo_restore: (desc, amt) => `복원: "${desc}" ${amt}`,
                undo_batch: (n) => `${n}건 복원되었습니다.`,
                undo_modify: (desc) => `"${desc}" 변경 취소됨`,
                ask_amount: (cat) => `${cat} 기록, 금액은?`,
                income_label: '수입', expense_label: '지출',
                deleted_single: (date, desc, amt) => `삭제: ${date} "${desc}" ${amt}<br><span class="text-white/35 text-xs">"되돌리기"로 복원</span>`,
                will_delete: (count, scope, total) => `<span class="text-xl font-bold font-num text-white">${count}</span>건 삭제 예정 (${scope}, 합계 ${total})<br><span class="text-[#e84393] text-xs">"확인"으로 진행, "취소"로 중단</span>`,
                query_result: (timeStr, catStr, typeStr, total) => `${timeStr}${catStr} ${typeStr} 합계: <span class="text-xl font-bold font-num text-white">${total}</span>`,
                query_no_data: (timeStr, catStr, typeStr) => `${timeStr}${catStr} ${typeStr} 기록이 없습니다.`,
                modified_last: (changes) => `이전 항목 수정: ${changes}`,
                modified_target: (desc, changes) => `"${desc}" 수정: ${changes}`,
                amount_to: (v) => `금액→${v}`, desc_to: (v) => `메모→${v}`, cat_to: (v) => `카테고리→${v}`, name_to: (v) => `이름→"${v}"`,
                recurring_set: (freq, desc, amt, cat) => `${freq} 자동 기록 설정: ${desc} <span class="text-teal-neon font-num">${amt}</span> [${cat}]<br><span class="text-xs text-white/60">이번에 기록됨, 이후 ${freq} 자동 추가</span>`,
                recurring_cancelled: (desc, amt) => `자동 기록 취소: "${desc}" ${amt}`,
                recurring_list_title: '현재 자동 기록 규칙:',
                freq_monthly: '매월', freq_weekly: '매주', freq_daily: '매일',
                shortcut_used: (desc, amt) => `바로가기:${desc} <span class="text-teal-neon font-num">${amt}</span>`,
                shortcut_set: (keyword, desc, amt) => `바로가기 설정: "${keyword}"로 ${desc} ${amt} 자동 기록`,
                shortcut_empty: '바로가기가 없습니다.',
                shortcut_list_title: '바로가기 목록:',
                last_record: (keyword, date, desc, amt) => `최근 ${keyword}: ${date} "${desc}" <span class="text-white font-num font-bold">${amt}</span>`,
                not_found_keyword: (keyword) => `"${keyword}" 관련 기록이 없습니다.`,
                insight_title: '소비 분석',
                insight_week_high: (amt, pct) => `이번주 지출 ${amt}, 지난주보다 ${pct}% 높음`,
                insight_cat_spike: (label, amt, times) => `${label} 이번주 ${amt}, 지난주의 ${times}배`,
                insight_normal: '이번주 소비가 정상입니다',
                budget_set_ai: (label, amt) => `${label} 월 예산 설정: <span class="text-white font-num font-bold">${amt}</span>`,
                budget_none: '예산이 설정되지 않았습니다.',
                budget_status_title: '이번달 예산 현황:'
            }
        };
        function ai(key, ...args) { const m = (aiMsg[currentLang] || aiMsg.zh)[key]; return typeof m === 'function' ? m(...args) : m; }

        function processAI(text) {
            text = text.trim();
            // === Feature 2: Handle pending confirmation ===
            if (pendingAction) {
                const confirm = text.match(/^(确认|是|对|好|yes|ok|confirm|确定|行|嗯|sure|done)$/i);
                const cancel = text.match(/^(取消|不|算了|no|否|不要|不是|cancel|stop)$/i);
                if (confirm) {
                    const pa = pendingAction;
                    pendingAction = null;
                    if (pa.type === 'batch-delete') {
                        const ids = new Set(pa.payload.map(t => t.id));
                        pushUndo('batch-add', pa.payload.map(t => ({...t})));
                        txs = txs.filter(t => !ids.has(t.id));
                        renderAll();
                        return ai('batch_deleted', pa.payload.length);
                    }
                    if (pa.type === 'confirm-record') {
                        return finishRecord(pa.payload);
                    }
                    return ai('confirmed');
                } else if (cancel) {
                    pendingAction = null;
                    return ai('cancelled');
                } else {
                    return ai('confirm_prompt');
                }
            }

            // === Greetings ===
            if (/^(你好|嗨|hi|hello|hey|哈喽|在吗|在不在|干嘛呢)$/i.test(text)) {
                const greets = [
                    '在的在的！钱包还好吗？有啥要记的尽管说~',
                    '嗨！我是你的记账搭子，随时准备见证你的消费实力💸',
                    '来了老板！今天准备花钱还是数钱？',
                    '你好呀！我每天的工作就是看你怎么花钱，挺刺激的',
                    '在呢！说吧，又买了啥好东西？',
                    '报告！记账员已就位，等待你的钱包发出悲鸣',
                    '嘿！花钱的时候想起我了？我很感动（并掏出小本本）',
                ];
                return greets[Math.floor(Math.random() * greets.length)];
            }

            // === Context-aware follow-up corrections ===
            if (lastAiTxId) {
                const lastTx = txs.find(tx => tx.id === lastAiTxId);
                if (lastTx) {
                    // Date correction: supports 今天/昨天/前天/大前天/本周一~日/上周X/周X/X号/X月X号/上个月/去年
                    const dateCorrMatch = text.match(/(不对|错了|应该|改成|改为|其实)?是?\s*(今天|昨天|大前天|前天|(本周|这周|上周|周)[一二三四五六日天]|(\d{1,2})月(\d{1,2})[号日]|(\d{1,2})[号日]|上个月|上月|这个月|本月|去年)/);
                    if (dateCorrMatch && !text.match(/(花了|花|买|吃|喝|打车|记|收入|饭|餐|菜|咖啡|奶茶|超市|外卖|水果|零食|早|午|晚|夜宵|[一二三四五六七八九十百千万]+[块元]?$|\d)/) ) {
                        const now = new Date();
                        let nd;
                        const dateWord = dateCorrMatch[2];
                        if (dateWord === '今天') nd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
                        else if (dateWord === '昨天') nd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0);
                        else if (dateWord === '前天') nd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 12, 0, 0);
                        else if (dateWord === '大前天') nd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3, 12, 0, 0);
                        else if (dateCorrMatch[3]) {
                            const wm = dateWord.match(/(本周|这周|上周|周)([一二三四五六日天])/);
                            if (wm) {
                                const dayMap = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':0,'天':0};
                                const targetDay = dayMap[wm[2]];
                                let base = wm[1] === '上周' ? new Date(now.getTime() - 7*86400000) : now;
                                const monday = getMonday(base);
                                const off = targetDay === 0 ? 6 : targetDay - 1;
                                nd = new Date(monday.getTime() + off * 86400000);
                                nd.setHours(12, 0, 0, 0);
                            }
                        }
                        else if (dateCorrMatch[4] && dateCorrMatch[5]) {
                            const m = parseInt(dateCorrMatch[4]) - 1;
                            const d = parseInt(dateCorrMatch[5]);
                            nd = new Date(now.getFullYear(), m, d, 12, 0, 0);
                        }
                        else if (dateCorrMatch[6]) {
                            const d = parseInt(dateCorrMatch[6]);
                            nd = new Date(now.getFullYear(), now.getMonth(), d, 12, 0, 0);
                        }
                        else if (dateWord === '上个月' || dateWord === '上月') {
                            const oldD = new Date(lastTx.date);
                            nd = new Date(now.getFullYear(), now.getMonth() - 1, oldD.getDate(), 12, 0, 0);
                        }
                        else if (dateWord === '这个月' || dateWord === '本月') {
                            const oldD = new Date(lastTx.date);
                            nd = new Date(now.getFullYear(), now.getMonth(), oldD.getDate(), 12, 0, 0);
                        }
                        else if (dateWord === '去年') {
                            const oldD = new Date(lastTx.date);
                            nd = new Date(now.getFullYear() - 1, oldD.getMonth(), oldD.getDate(), 12, 0, 0);
                        }
                        if (nd) {
                            pushUndo('modify', {...lastTx});
                            lastTx.date = nd.toISOString();
                            renderAll();
                            return `<i data-lucide="check" class="w-4 h-4 inline-block text-teal-neon"></i> 已改为${dateWord}`;
                        }
                    }
                    // Category correction: "是餐饮" / "这是宠物" / "宠物" (bare name only)
                    const hasCnNum = /[百千万亿十]/.test(text) || parseCnNumber(text) > 0;
                    const hasAction = /\d|删除|删|查|花了|花|买|吃|喝|打车|记|赚|收入|多少|所有|全部|本月|本周|上月/.test(text);
                    if (!hasCnNum && !hasAction) {
                        const catCorrPrefix = text.match(/^(这?是|分类|类型|归到|改成|改为|算)\s*(.+)/);
                        const catCorrInput = catCorrPrefix ? catCorrPrefix[2].replace(/[的类]$/, '').trim() : text.trim();
                        if (catCorrInput.length <= 6) {
                            const allCatsCorr = {...EXPENSE_CATS, ...INCOME_CATS};
                            for (let key in allCatsCorr) {
                                if (allCatsCorr[key].label === catCorrInput) {
                                    pushUndo('modify', {...lastTx});
                                    lastTx.cat = key;
                                    if (lastTx.desc && lastTx.desc !== allCatsCorr[key].label) learnCategory(lastTx.desc, key);
                                    renderAll();
                                    return `<i data-lucide="check" class="w-4 h-4 inline-block text-teal-neon"></i> 分类已改为${allCatsCorr[key].label}`;
                                }
                            }
                            // 没匹配到已有分类 → 自动创建自定义分类
                            if (lastTx.cat === 'other' && catCorrInput.length >= 1) {
                                const customKey = 'custom_' + catCorrInput;
                                if (!EXPENSE_CATS[customKey]) {
                                    EXPENSE_CATS[customKey] = { label: catCorrInput, color: PRESET_COLORS[Object.keys(EXPENSE_CATS).length % PRESET_COLORS.length], icon: 'tag' };
                                    const customs = JSON.parse(nfStorage.getItem('custom_expense_cats') || '{}');
                                    customs[customKey] = EXPENSE_CATS[customKey];
                                    nfStorage.setItem('custom_expense_cats', JSON.stringify(customs));
                                }
                                pushUndo('modify', {...lastTx});
                                lastTx.cat = customKey;
                                learnCategory(lastTx.desc, customKey);
                                renderAll();
                                return `<i data-lucide="check" class="w-4 h-4 inline-block text-teal-neon"></i> ${t('cat_created')(catCorrInput)}`;
                            }
                        }
                    }
                }
            }
            // Amount/desc correction: "改成30" / "金额改成50" / "是150" / "不对是200"
            if (lastAiTxId) {
                const lastTx = txs.find(tx => tx.id === lastAiTxId);
                if (lastTx) {
                    const amtCorr = text.match(/(?:金额|价格)?(?:改成|改为|是)\s*(\d+(\.\d+)?)\s*[元块]?$/);
                    if (amtCorr && !text.match(/(花|记|打车|吃|喝|买|赚|收入|工资)/)) {
                        pushUndo('modify', {...lastTx});
                        lastTx.amount = parseFloat(amtCorr[1]);
                        renderAll();
                        return `<i data-lucide="check" class="w-4 h-4 inline-block text-teal-neon"></i> 金额已改为${amtCorr[1]}`;
                    }
                    const descCorr = text.match(/(?:备注|描述|名字)(?:改成|改为)\s*(.+)/);
                    if (descCorr) {
                        pushUndo('modify', {...lastTx});
                        const newDesc = descCorr[1].trim();
                        lastTx.desc = newDesc;
                        learnCategory(newDesc, lastTx.cat);
                        renderAll();
                        return `<i data-lucide="check" class="w-4 h-4 inline-block text-teal-neon"></i> 备注已改为"${newDesc}"`;
                    }
                }
            }

            // === Feature 1: Handle multi-turn continuation ===
            if (multiTurnState) {
                const state = multiTurnState;
                if (state.step === 'need_amount') {
                    const numM = text.match(/(\d+(\.\d+)?)/);
                    const cnAmt = parseCnNumber(text);
                    if (numM) {
                        state.partial.amount = parseFloat(numM[0]);
                        multiTurnState = null;
                        return finishRecord(state.partial);
                    } else if (cnAmt > 0) {
                        state.partial.amount = cnAmt;
                        multiTurnState = null;
                        return finishRecord(state.partial);
                    } else {
                        return ai('enter_amount');
                    }
                } else if (state.step === 'need_desc') {
                    state.partial.desc = text.trim();
                    multiTurnState = null;
                    return finishRecord(state.partial);
                } else if (state.step === 'need_cat') {
                    const catM = parseCategoryForAI(text);
                    if (catM) {
                        state.partial.cat = catM.key;
                        multiTurnState = null;
                        return finishRecord(state.partial);
                    } else {
                        multiTurnState = null;
                        return finishRecord(state.partial);
                    }
                }
                multiTurnState = null;
            }

            const timeInfo = parseTime(text);
            const cleanText = timeInfo ? text.replace(timeInfo.match, "").trim() : text;
            // Force-match custom category: try all categories including custom ones
            let catInfo = null;
            const _stripped = text.replace(/[\d\s.]+/g, '').replace(/(花了|买了|块钱|块|元)/g, '').trim();
            const _stripEmoji = s => s.replace(/[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').trim();
            const _expKeys = Object.keys(EXPENSE_CATS);
            for (let i = 0; i < _expKeys.length; i++) {
                const _c = EXPENSE_CATS[_expKeys[i]];
                const _lbl = _stripEmoji(_c.label);
                if (_lbl === _stripped || _stripped === _c.label || text.includes(_lbl) || text.includes(_c.label)) {
                    catInfo = { key: _expKeys[i], ..._c };
                    break;
                }
            }
            if (!catInfo) {
                const _incKeys = Object.keys(INCOME_CATS);
                for (let i = 0; i < _incKeys.length; i++) {
                    const _c = INCOME_CATS[_incKeys[i]];
                    const _lbl = _stripEmoji(_c.label);
                    if (_lbl === _stripped || _stripped === _c.label || text.includes(_lbl) || text.includes(_c.label)) {
                        catInfo = { key: _incKeys[i], ..._c };
                        break;
                    }
                }
            }
            if (!catInfo) catInfo = parseCategoryForAI(text);

            let amountText = cleanText;
            const mixedMatch = amountText.match(/(\d+(\.\d+)?)\s*([万千百亿])/);
            let numMatch = amountText.match(/(\d+(\.\d+)?)/);
            let amount = 0;
            if (mixedMatch) {
                const unitMap = {'百':100,'千':1000,'万':10000,'亿':100000000};
                amount = parseFloat(mixedMatch[1]) * unitMap[mixedMatch[3]];
                numMatch = [mixedMatch[0]];
            } else if (numMatch) {
                amount = parseFloat(numMatch[0]);
            }
            if (!amount) {
                const cnAmt = parseCnNumber(amountText);
                if (cnAmt > 0) amount = cnAmt;
            }

            // === Feature 3: Undo ===
            if (text.match(/^(撤回|撤销|undo|回退)$/)) {
                if (undoStack.length === 0) return ai('no_undo');
                const last = undoStack.pop();
                if (last.action === 'add') {
                    txs = txs.filter(t => t.id !== last.data.id);
                    renderAll();
                    return ai('undo_record', last.data.desc, last.data.amount);
                } else if (last.action === 'delete') {
                    txs.push(last.data);
                    renderAll();
                    return ai('undo_restore', last.data.desc, last.data.amount);
                } else if (last.action === 'batch-add') {
                    txs = txs.filter(t => !last.data.find(d => d.id === t.id));
                    renderAll();
                    return ai('undo_batch', last.data.length);
                } else if (last.action === 'modify') {
                    const idx = txs.findIndex(t => t.id === last.data.id);
                    if (idx > -1) txs[idx] = last.data;
                    renderAll();
                    return ai('undo_modify', last.data.desc);
                }
                return ai('undone');
            }

            // === Feature 9: Shortcut usage ===
            if (shortcuts[text.trim()]) {
                const sc = shortcuts[text.trim()];
                const newTx = { id: Date.now() + Math.floor(Math.random() * 10000), date: new Date().toISOString(), desc: sc.desc, amount: sc.amount, cat: sc.cat, type: sc.type };
                txs.push(newTx);
                pushUndo('add', {...newTx});
                lastAiTxId = newTx.id;
                renderAll();
                const budgetWarn = checkBudgetAfterRecord(sc.cat, sc.type);
                return ai('shortcut_used', sc.desc, sc.amount) + budgetWarn;
            }

            // === Feature 9: Set shortcut ===
            if (text.match(/(设为快捷|设置快捷|添加快捷)/)) {
                const keyword = text.replace(/(设为快捷|设置快捷|添加快捷|记账)/g, '').trim();
                if (!keyword) return ai('shortcut_prompt');
                const lastTx = lastAiTxId ? txs.find(t => t.id === lastAiTxId) : txs[txs.length - 1];
                if (!lastTx) return ai('no_shortcut_tx');
                shortcuts[keyword] = { desc: lastTx.desc, amount: lastTx.amount, cat: lastTx.cat, type: lastTx.type };
                saveShortcuts();
                return ai('shortcut_set', keyword, lastTx.desc, lastTx.amount);
            }
            if (text.match(/(查看快捷|有哪些快捷|快捷列表)/)) {
                const keys = Object.keys(shortcuts);
                if (keys.length === 0) return ai('shortcut_empty');
                const list = keys.map(k => `• "${k}" → ${shortcuts[k].desc} ${shortcuts[k].amount}`).join('<br>');
                return `${ai('shortcut_list_title')}<br>${list}`;
            }
            if (text.match(/(删除快捷|取消快捷)/)) {
                const keyword = text.replace(/(删除快捷|取消快捷)/g, '').trim();
                if (shortcuts[keyword]) { delete shortcuts[keyword]; saveShortcuts(); return `✓ "${keyword}"`; }
                return ai('shortcut_not_found');
            }

            // === Feature 4: Budget management ===
            if (text.match(/(设置预算|设定预算|预算设为|预算设置)/)) {
                const budgetAmt = text.match(/(\d+(\.\d+)?)/);
                if (!budgetAmt) return ai('specify_budget');
                const amt = parseFloat(budgetAmt[0]);
                if (catInfo) {
                    budgets[catInfo.key] = amt;
                    saveBudgets();
                    return ai('budget_set_ai', catInfo.label, amt.toLocaleString());
                } else {
                    totalBudget = amt;
                    nfStorage.setItem(getTotalBudgetKey(), totalBudget);
                    return ai('budget_set_ai', '总', amt.toLocaleString());
                }
            }
            if (text.match(/(查看预算|预算情况|预算还剩|预算多少)/)) {
                const bKeys = Object.keys(budgets);
                if (bKeys.length === 0 && totalBudget <= 0) return ai('budget_none');
                const now2 = new Date();
                const monthStart = new Date(now2.getFullYear(), now2.getMonth(), 1);
                let result = `${ai('budget_status_title')}<br>`;
                if (totalBudget > 0) {
                    const spent = txs.filter(t => t.type==='expense' && new Date(t.date)>=monthStart).reduce((s,t)=>s+t.amount,0);
                    const pct = Math.round(spent/totalBudget*100);
                    const color = pct > 100 ? 'text-finance-rise' : (pct > 80 ? 'text-[#e84393]' : 'text-teal-neon');
                    result += `• ${t('total_budget')}: ${spent.toLocaleString()} / ${totalBudget.toLocaleString()} <span class="${color} font-num">${pct}%</span><br>`;
                }
                bKeys.forEach(k => {
                    const bAmt = budgets[k];
                    let spent = txs.filter(t => t.type==='expense' && t.cat===k && new Date(t.date)>=monthStart).reduce((s,t)=>s+t.amount,0);
                    const pct = Math.round(spent/bAmt*100);
                    const label = (EXPENSE_CATS[k]||{label:k}).label;
                    const color = pct > 100 ? 'text-finance-rise' : (pct > 80 ? 'text-[#e84393]' : 'text-teal-neon');
                    result += `• ${label}: ${spent.toLocaleString()} / ${bAmt.toLocaleString()} <span class="${color} font-num">${pct}%</span><br>`;
                });
                return result;
            }
            if (text.match(/(删除预算|取消预算|清除预算)/)) {
                const bCat = catInfo ? catInfo.key : 'total';
                if (budgets[bCat]) { delete budgets[bCat]; saveBudgets(); return ai('budget_deleted'); }
                return ai('no_budget_found');
            }

            // === Feature 5: Smart summary ===
            if (text.match(/(总结|月报|月度总结|小结|账单总结|报告|summary|report)/i)) {
                const now2 = new Date();
                const monthStart = new Date(now2.getFullYear(), now2.getMonth(), 1);
                const prevStart = new Date(now2.getFullYear(), now2.getMonth()-1, 1);
                const prevEnd = new Date(now2.getFullYear(), now2.getMonth(), 0, 23,59,59,999);

                const thisMonth = txs.filter(t => new Date(t.date) >= monthStart);
                const prevMonth = txs.filter(t => { const d=new Date(t.date); return d>=prevStart && d<=prevEnd; });

                const thisIncome = thisMonth.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
                const thisExpense = thisMonth.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
                const prevExpense = prevMonth.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);

                const catMap = {};
                thisMonth.filter(t=>t.type==='expense').forEach(t => { catMap[t.cat]=(catMap[t.cat]||0)+t.amount; });
                const sortedCats = Object.keys(catMap).sort((a,b)=>catMap[b]-catMap[a]);
                const topCats = sortedCats.slice(0,3).map(k => {
                    const label = t('cat_' + k) || (EXPENSE_CATS[k]||{label:k}).label;
                    return `${label} ${catMap[k].toLocaleString()}`;
                }).join(currentLang === 'zh' ? '、' : ', ');

                const biggest = thisMonth.filter(t=>t.type==='expense').sort((a,b)=>b.amount-a.amount)[0];
                const _biggest = currentLang === 'zh' ? '最大单笔' : currentLang === 'en' ? 'Largest' : currentLang === 'ja' ? '最大' : '최대';
                const biggestStr = biggest ? `${_biggest}：${biggest.desc} ${biggest.amount.toLocaleString()}` : '';

                let compareStr = '';
                if (prevExpense > 0) {
                    const diff = ((thisExpense - prevExpense) / prevExpense * 100).toFixed(1);
                    const upDown = diff >= 0
                        ? (currentLang==='zh'?'增长':currentLang==='en'?'Up':currentLang==='ja'?'増加':'증가')
                        : (currentLang==='zh'?'减少':currentLang==='en'?'Down':currentLang==='ja'?'減少':'감소');
                    compareStr = `${upDown} <span class="${diff>=0?'text-finance-rise':'text-finance-fall'} font-num">${Math.abs(diff)}%</span>`;
                }

                const _title = currentLang==='zh'?'本月账单总结':currentLang==='en'?'Monthly Summary':currentLang==='ja'?'今月のまとめ':'이달 요약';
                const _income = t('income');
                const _expense = t('expense');
                const _balance = currentLang==='zh'?'结余':currentLang==='en'?'Balance':currentLang==='ja'?'残高':'잔액';
                const _top3 = currentLang==='zh'?'支出Top3':currentLang==='en'?'Top 3':currentLang==='ja'?'支出Top3':'지출 Top3';
                const _none = currentLang==='zh'?'暂无':currentLang==='en'?'None':currentLang==='ja'?'なし':'없음';

                return `<span class="text-white font-bold"><i data-lucide="bar-chart-3" class="w-4 h-4 inline-block"></i> ${_title}</span><br><br>` +
                    `${_income}：<span class="text-teal-neon font-num">${thisIncome.toLocaleString()}</span><br>` +
                    `${_expense}：<span class="text-white font-num font-bold">${thisExpense.toLocaleString()}</span> ${compareStr}<br>` +
                    `${_balance}：<span class="text-cyber-blue font-num">${(thisIncome-thisExpense).toLocaleString()}</span><br><br>` +
                    `${_top3}：${topCats || _none}<br>` +
                    `${biggestStr}`;
            }

            // === Feature 7: Export ===
            if (text.match(/(导出|下载|导出账单|生成表格|export)/)) {
                let exportList = txs;
                if (timeInfo) exportList = txs.filter(t => { const d=new Date(t.date); return d>=timeInfo.start && d<=timeInfo.end; });
                if (exportList.length === 0) return ai('no_export_data');

                const csvHeader = `${t('date_label')},${t('all_types')},${t('cat_label')},${t('note_label')},${t('amount_placeholder')}`;
                const rows = exportList.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(tx => {
                    const d = new Date(tx.date);
                    const dateStr = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
                    const catLabel = t('cat_' + tx.cat) || (tx.type==='income' ? INCOME_CATS : EXPENSE_CATS)[tx.cat]?.label || tx.cat;
                    return `${dateStr},${tx.type==='income'? ai('income_label') : ai('expense_label')},${catLabel},${tx.desc},${tx.amount}`;
                });
                const csv = csvHeader + '\n' + rows.join('\n');
                const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8;'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `bills_${new Date().toISOString().slice(0,10)}.csv`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setTimeout(() => generateBillImage(exportList), 300);
                return ai('exported', exportList.length);
            }

            // Detect recurring intent
            const recurMatch = text.match(/(每个月|每月|每周|每天|每日)/);
            const isRecurring = recurMatch && text.match(/(自动|定期|固定|重复)/);

            // Detect fuzzy category reply: user answers "是吃的" / "餐饮" / "宠物" etc. after an "other" record
            if (lastAiTxId && !numMatch && !amount) {
                const lastTx = txs.find(tx => tx.id === lastAiTxId);
                if (lastTx && lastTx.cat === 'other') {
                    // First try parseCategoryForAI
                    const fuzzyCat = parseCategoryForAI(text);
                    if (fuzzyCat) {
                        pushUndo('modify', {...lastTx});
                        lastTx.cat = fuzzyCat.key;
                        learnCategory(lastTx.desc, fuzzyCat.key);
                        renderAll();
                        return ai('modified_target', lastTx.desc, ai('cat_to', fuzzyCat.label));
                    }
                    // Direct scan: strip prefixes and match against all category labels
                    const bareInput = text.replace(/^(这?是|分类|类型|归到|算)\s*/, '').replace(/[的类]$/, '').trim();
                    const _seD = s => s.replace(/[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').trim();
                    if (bareInput.length >= 1 && bareInput.length <= 8) {
                        const _eKeys = Object.keys(EXPENSE_CATS);
                        for (let i = 0; i < _eKeys.length; i++) {
                            if (EXPENSE_CATS[_eKeys[i]].label === bareInput || _seD(EXPENSE_CATS[_eKeys[i]].label) === bareInput) {
                                pushUndo('modify', {...lastTx});
                                lastTx.cat = _eKeys[i];
                                learnCategory(lastTx.desc, _eKeys[i]);
                                renderAll();
                                return `<i data-lucide="check" class="w-4 h-4 inline-block text-teal-neon"></i> 分类已改为${EXPENSE_CATS[_eKeys[i]].label}`;
                            }
                        }
                        const _iKeys = Object.keys(INCOME_CATS);
                        for (let i = 0; i < _iKeys.length; i++) {
                            if (INCOME_CATS[_iKeys[i]].label === bareInput || _seD(INCOME_CATS[_iKeys[i]].label) === bareInput) {
                                pushUndo('modify', {...lastTx});
                                lastTx.cat = _iKeys[i];
                                learnCategory(lastTx.desc, _iKeys[i]);
                                renderAll();
                                return `<i data-lucide="check" class="w-4 h-4 inline-block text-teal-neon"></i> 分类已改为${INCOME_CATS[_iKeys[i]].label}`;
                            }
                        }
                    }
                }
            }

            // 规则学习: "以后/未来的XX都记成YY"
            const ruleMatch = text.match(/(?:以后|未来|之后|今后)(?:的|把)?(.+?)(?:都|全部|全|统一)?(?:记成|记为|算成|算作|归为|归到|分类为|算|记)(.+)/);
            if (ruleMatch) {
                const ruleDesc = ruleMatch[1].replace(/的$/, '').trim();
                const ruleCatName = ruleMatch[2].replace(/[类吧]$/, '').trim();
                const allCatsRule = {...EXPENSE_CATS, ...INCOME_CATS};
                let foundKey = null;
                for (let key in allCatsRule) {
                    if (allCatsRule[key].label === ruleCatName) { foundKey = key; break; }
                }
                if (foundKey && ruleDesc.length >= 1 && ruleDesc.length <= 8) {
                    learnCategory(ruleDesc, foundKey);
                    return `<i data-lucide="check" class="w-4 h-4 inline-block text-teal-neon"></i> ${t('cat_learned')(ruleDesc, allCatsRule[foundKey].label)}`;
                }
            }

            // Detect contextual modify
            const isContextModify = text.match(/(这个|这一笔|上一个|那个|刚才|上一笔|那一笔)/) && text.match(/(换|变成|改成|改为|改名|换成|换下)/) && !text.match(/(分类|类别|类型)/)

            // Determine intent
            const isQuery = text.match(/(多少|查询|统计|总共|一共|合计)/) ||
                           (text.match(/(花费|支出|收入|花了)/) && !numMatch && !amount);
            const isDelete = text.match(/(删除|移除|撤销|去掉|清空|清除)/);
            const isModifyIntent = text.match(/(修改|改成|改为|更新|把.+改)/);

            if (isQuery && !isDelete) {
                let targetType = 'expense';
                if(text.match(/(收入|赚|入账)/) && !text.match(/(支出|花)/)) targetType = 'income';

                let filtered = txs.filter(t => {
                    const d = new Date(t.date);
                    let dateMatch = true;
                    if(timeInfo) {
                        dateMatch = d >= timeInfo.start && d <= timeInfo.end;
                    }
                    let typeMatch = t.type === targetType;
                    let catMatch = true;
                    if(catInfo) catMatch = t.cat === catInfo.key;

                    return dateMatch && typeMatch && catMatch;
                });

                const total = filtered.reduce((acc, curr) => acc + curr.amount, 0);
                const _allTime = currentLang==='zh'?'历史累计':currentLang==='en'?'All time':currentLang==='ja'?'累計':'전체 기간';
                const timeStr = timeInfo ? timeInfo.label : _allTime;
                const typeStr = targetType === 'expense' ? t('expense') : t('income');
                const catStr = catInfo ? (t('cat_' + catInfo.key) || catInfo.label) : "";

                let insight = "";
                if (filtered.length > 0 && !catInfo) {
                    const catMap = {};
                    filtered.forEach(tx => { catMap[tx.cat] = (catMap[tx.cat] || 0) + tx.amount; });
                    const topCatKey = Object.keys(catMap).reduce((a, b) => catMap[a] > catMap[b] ? a : b);
                    const topCatName = t('cat_' + topCatKey) || (EXPENSE_CATS[topCatKey] || INCOME_CATS[topCatKey] || {label:'?'}).label;
                    const topCatAmount = catMap[topCatKey];
                    const _top = currentLang==='zh'?'，其中':currentLang==='en'?', mostly ':currentLang==='ja'?'、主に':'、주로 ';
                    insight = `${_top}<span class="text-cyber-purple">${topCatName}</span> (${topCatAmount.toLocaleString()})`;
                }

                if (total === 0) return ai('query_no_data', timeStr, catStr, typeStr);
                return ai('query_result', timeStr, catStr, typeStr, total.toLocaleString()) + `${insight}`;
            }

            if (isDelete) {
                 const isBatch = text.match(/(所有|全部|所有的|全部的|都|清空|清除)/);
                 const keyWord = cleanText.replace(/(删除|移除|撤销|去掉|清空|清除|所有|全部|其他|的|记录|消费|数据|账|记账|账单|那笔|那个|都)/g, "").replace(/\d+(\.\d+)?/g, '').trim();

                 // Filter targets by date, type, category, keyword
                 let targets = txs.filter(t => {
                     const d = new Date(t.date);
                     const timeMatch = timeInfo ? (d >= timeInfo.start && d <= timeInfo.end) : true;
                     const catMatch = catInfo ? t.cat === catInfo.key : true;
                     const wordMatch = keyWord ? t.desc.includes(keyWord) : true;
                     let typeMatch = true;
                     if (text.match(/(支出|花)/) && !text.match(/收入/)) typeMatch = t.type === 'expense';
                     else if (text.match(/收入/) && !text.match(/(支出|花)/)) typeMatch = t.type === 'income';
                     return timeMatch && catMatch && wordMatch && typeMatch;
                 });

                 if (isBatch) {
                     if (targets.length === 0) return ai('no_match');
                     const count = targets.length;
                     const totalAmt = targets.reduce((s, t) => s + t.amount, 0);
                     const scope = timeInfo ? timeInfo.label : (catInfo ? catInfo.label : t('all'));
                     pendingAction = { type: 'batch-delete', payload: targets.map(t=>({...t})) };
                     return ai('will_delete', count, scope, totalAmt.toLocaleString());
                 } else {
                     const targetTx = [...targets].reverse()[0];
                     if (targetTx) {
                         pushUndo('delete', {...targetTx});
                         txs = txs.filter(t => t.id !== targetTx.id);
                         renderAll();
                         return ai('deleted_single', new Date(targetTx.date).toLocaleDateString(), targetTx.desc, targetTx.amount);
                     } else { return ai('not_found'); }
                 }
            }

            // Context modify: "这个名字换下 变成工资" / "上一笔改成XX"
            if (isContextModify) {
                 const lastTx = lastAiTxId ? txs.find(t => t.id === lastAiTxId) : null;
                 if (!lastTx) return ai("no_last_tx");

                 const lastTxSnapshot = {...lastTx};
                 let changes = [];
                 const nameMatch = text.match(/(?:变成|改成|换成|改为|改名)\s*(.+?)(?:\d|$)/);
                 const nameMatch2 = text.match(/(?:变成|改成|换成|改为|改名)\s*(.+)/);
                 let newName = (nameMatch ? nameMatch[1] : (nameMatch2 ? nameMatch2[1] : '')).trim();
                 newName = newName.replace(/\d+(\.\d+)?/g, '').replace(/(元|块|块钱)$/,'').trim();

                 if (newName) {
                     lastTx.desc = newName;
                     changes.push(ai('name_to', newName));
                 }
                 if (amount > 0) {
                     lastTx.amount = amount;
                     changes.push(ai('amount_to', amount));
                 }
                 const newCatFromName = parseCategoryForAI(newName || text);
                 if (newCatFromName && newCatFromName.key !== lastTx.cat) {
                     lastTx.cat = newCatFromName.key;
                     changes.push(ai('cat_to', newCatFromName.label));
                 }

                 if (changes.length === 0) return ai("specify_change");
                 pushUndo('modify', lastTxSnapshot);
                 lastAiTxId = lastTx.id;
                 renderAll();
                 return ai('modified_last', changes.join(', '));
            }

            // Modify: "把XX改成YY" / "修改XX金额为YY" / "肯德基改为餐饮"
            const isModify = text.match(/(修改|改成|改为|更新|把.+改|类型|是.+的)/);
            if (isModify && !isContextModify) {
                 const amountChange = text.match(/(?:金额|改成|改为)\s*(\d+(\.\d+)?)/);
                 const descChange = text.match(/(?:备注|描述|名字|名称)(?:改成|改为|更新为|换成)\s*(.+?)(?:$|，|,)/);
                 const catChange = text.match(/(?:分类|类别|类型)(?:改成|改为|换成)\s*(.+?)(?:$|，|,)/);

                 // Pattern: "X改为Y" / "X是Y的" where X=desc, Y=category
                 const directCatChange = text.match(/^(.+?)(?:改为|改成|换成|归为|归到|是)(.+?)(?:的)?$/);
                 let directCatTarget = null;
                 let directCatNew = null;
                 let directCatRaw = null;
                 if (directCatChange && !amountChange && !descChange && !catChange) {
                     const possibleDesc = directCatChange[1].replace(/(把|将|修改|这一笔|这个|那个|上一笔)/g, '').trim();
                     const possibleCat = directCatChange[2].replace(/(分类|类别|类型)/g, '').trim();
                     const parsedCat = parseCategoryForAI(possibleCat);
                     if (parsedCat) {
                         directCatTarget = possibleDesc;
                         directCatNew = parsedCat;
                     } else if (possibleCat) {
                         directCatTarget = possibleDesc;
                         directCatRaw = possibleCat;
                     }
                 }

                 // Find target: first try lastAiTxId, then search by keyword
                 let keyWord2 = cleanText.replace(/(修改|改成|改为|更新|把|的|金额|备注|描述|分类|类别|类型|名字|名称|归为|归到)/g, "").replace(/\d+(\.\d+)?/g, '').trim();
                 if (directCatTarget) keyWord2 = directCatTarget;
                 else {
                     const afterChange = cleanText.match(/(?:改为|改成|换成|归为|归到)(.+)/);
                     if (afterChange) keyWord2 = keyWord2.replace(afterChange[1].trim(), '').trim();
                     const allCatLabels = Object.values({...EXPENSE_CATS, ...INCOME_CATS}).map(c => c.label);
                     allCatLabels.forEach(l => { keyWord2 = keyWord2.replace(l, ''); });
                     keyWord2 = keyWord2.replace(/(餐饮|交通|购物|娱乐|居住|数码|吃|喝)/g, '').trim();
                 }

                 let targetTx = null;
                 if (text.match(/(这个|这一笔|上一个|那个|刚才|上一笔|那一笔)/) && lastAiTxId) {
                     targetTx = txs.find(t => t.id === lastAiTxId);
                 }
                 if (!targetTx && lastAiTxId && !keyWord2) {
                     targetTx = txs.find(t => t.id === lastAiTxId);
                 }
                 if (!targetTx) {
                     targetTx = [...txs].reverse().find(t => {
                         const d = new Date(t.date);
                         const timeMatch = timeInfo ? (d >= timeInfo.start && d <= timeInfo.end) : true;
                         const wordMatch = keyWord2 ? t.desc.includes(keyWord2) : false;
                         return timeMatch && wordMatch;
                     });
                 }

                 if (!targetTx) return ai("not_found_modify");

                 const txSnapshot = {...targetTx};
                 let changes = [];
                 if (amountChange) {
                     targetTx.amount = parseFloat(amountChange[1]);
                     changes.push(ai('amount_to', targetTx.amount));
                 }
                 if (descChange) {
                     targetTx.desc = descChange[1].trim();
                     changes.push(ai('desc_to', targetTx.desc));
                 }
                 if (catChange) {
                     const newCatInfo = parseCategoryForAI(catChange[1]) || fuzzyMatchCat(catChange[1].trim(), targetTx.type);
                     if (newCatInfo) {
                         targetTx.cat = newCatInfo.key;
                         changes.push(ai('cat_to', newCatInfo.label));
                     } else {
                         const rawCat = catChange[1].trim();
                         const catKey = rawCat.toLowerCase();
                         const cats = targetTx.type === 'income' ? INCOME_CATS : EXPENSE_CATS;
                         cats[catKey] = { label: rawCat, icon: 'tag', color: '#7c3aed' };
                         saveCustomCats();
                         targetTx.cat = catKey;
                         changes.push(ai('cat_to', rawCat));
                     }
                 }
                 if (directCatNew && changes.length === 0) {
                     targetTx.cat = directCatNew.key;
                     changes.push(ai('cat_to', directCatNew.label));
                 }
                 if (!directCatNew && directCatRaw && changes.length === 0) {
                     const fuzzy = fuzzyMatchCat(directCatRaw, targetTx.type);
                     if (fuzzy) {
                         targetTx.cat = fuzzy.key;
                         changes.push(ai('cat_to', fuzzy.label));
                     } else {
                         const catKey = directCatRaw.toLowerCase();
                         const cats = targetTx.type === 'income' ? INCOME_CATS : EXPENSE_CATS;
                         cats[catKey] = { label: directCatRaw, icon: 'tag', color: '#7c3aed' };
                         saveCustomCats();
                         targetTx.cat = catKey;
                         changes.push(ai('cat_to', directCatRaw));
                     }
                 }

                 if (changes.length === 0 && amount > 0) {
                     targetTx.amount = amount;
                     changes.push(ai('amount_to', amount));
                 }

                 if (changes.length === 0) return ai("specify_what");
                 pushUndo('modify', txSnapshot);

                 lastAiTxId = targetTx.id;
                 renderAll();
                 return ai('modified_target', targetTx.desc, changes.join(', '));
            }

            // Recurring: "每个月自动新增10000工资"
            if (isRecurring && amount > 0) {
                let freq = 'monthly';
                if (text.match(/(每周)/)) freq = 'weekly';
                else if (text.match(/(每天|每日)/)) freq = 'daily';

                let desc = cleanText.replace(numMatch[0], '').replace(/(每个月|每月|每周|每天|每日|自动|定期|固定|重复|新增|添加|增加|记|入账|的)/g, '').trim();
                let type = 'expense';
                let cat = 'other';

                if (text.match(/(收入|工资|奖金|入账|赚)/)) {
                    type = 'income';
                    if(text.match(/工资/)) cat = 'salary';
                    else if(text.match(/奖金/)) cat = 'bonus';
                    else if(text.match(/(理财|利息)/)) cat = 'investment';
                    else cat = 'other_in';
                } else if (catInfo) {
                    cat = catInfo.key;
                }

                if (!desc) {
                    const catObj = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
                    desc = (catObj[cat] || {label: t('expense')}).label;
                }

                const freqLabel = ai(freq === 'monthly' ? 'freq_monthly' : (freq === 'weekly' ? 'freq_weekly' : 'freq_daily'));
                const rId = 'r_' + Date.now();
                const newRecurring = { id: rId, freq, desc, amount, cat, type, day: new Date().getDate(), dayOfWeek: (new Date().getDay()||7), bookId: currentBook };
                recurringTxs.push(newRecurring);
                nfStorage.setItem('recurringTxs', JSON.stringify(recurringTxs));

                // Also add one immediately for this period
                const newTx = { id: Date.now() + Math.floor(Math.random() * 10000), date: new Date().toISOString(), desc, amount, cat, type };
                txs.push(newTx);
                lastAiTxId = newTx.id;
                renderAll();
                return ai('recurring_set', freqLabel, desc, amount, (type==='income'?INCOME_CATS:EXPENSE_CATS)[cat]?.label||'');
            }

            if (amount > 0) {
                // Smart confirmation for large amounts with uncertain category
                if (amount >= 100000 && !catInfo) {
                    pendingAction = { type: 'confirm-record', payload: { timeInfo, text, cleanText, amountText, numMatch, amount, catInfo } };
                    const confirmMsg = currentLang === 'zh' ? `确认记录 <span class="text-teal-neon font-num font-bold">${amount}</span> 元吗？（说"确认"继续，"取消"放弃）` : `Confirm recording <span class="text-teal-neon font-num font-bold">${amount}</span>? (say "yes" or "no")`;
                    return confirmMsg;
                }
                return finishRecord({ timeInfo, text, cleanText, amountText, numMatch, amount, catInfo });
            }

            // === Feature 1: Multi-turn — has keywords but no amount ===
            if (catInfo && !amount && !isQuery) {
                multiTurnState = { step: 'need_amount', partial: { timeInfo, text, cleanText, amountText:'', numMatch:null, amount:0, catInfo } };
                return ai('ask_amount', t('cat_' + catInfo.key) || catInfo.label);
            }

            // Handle "取消自动/取消定期" to remove recurring
            if (text.match(/(取消|停止|关闭).*(自动|定期|固定|重复)/)) {
                const keyWord = cleanText.replace(/(取消|停止|关闭|自动|定期|固定|重复|记账|的)/g, '').trim();
                const idx = recurringTxs.findIndex(r => !keyWord || r.desc.includes(keyWord));
                if (idx > -1) {
                    const removed = recurringTxs.splice(idx, 1)[0];
                    nfStorage.setItem('recurringTxs', JSON.stringify(recurringTxs));
                    return ai('recurring_cancelled', removed.desc, removed.amount);
                }
                return ai("no_recurring_match");
            }

            // List recurring
            if (text.match(/(查看|有哪些|列出).*(自动|定期|固定|重复)/)) {
                if (recurringTxs.length === 0) return ai("no_recurring");
                const list = recurringTxs.map(r => {
                    const fl = ai(r.freq === 'monthly' ? 'freq_monthly' : (r.freq === 'weekly' ? 'freq_weekly' : 'freq_daily'));
                    return `• ${fl} ${r.desc} ${r.amount}`;
                }).join('<br>');
                return `${ai('recurring_list_title')}<br>${list}`;
            }

            // === Feature 6: "上次打车" / "最近那笔奶茶" ===
            if (text.match(/(上次|上一次|最近那笔|最近一笔)/)) {
                const keyword = text.replace(/(上次|上一次|最近那笔|最近一笔|的|记录|多少|是)/g, '').trim();
                const found = [...txs].reverse().find(t => keyword ? (t.desc.includes(keyword) || (EXPENSE_CATS[t.cat]||INCOME_CATS[t.cat]||{}).label === keyword) : false);
                if (found) {
                    lastAiTxId = found.id;
                    const d = new Date(found.date);
                    return ai('last_record', keyword, `${d.getMonth()+1}/${d.getDate()}`, found.desc, found.amount.toLocaleString());
                }
                return ai('not_found_keyword', keyword);
            }

            // === Feature 8: Weekly insight (proactive) ===
            if (text.match(/(分析|洞察|消费习惯|花钱规律)/)) {
                const now2 = new Date();
                const weekAgo = new Date(now2.getTime() - 7*24*60*60*1000);
                const prevWeek = new Date(now2.getTime() - 14*24*60*60*1000);
                const thisWeekExp = txs.filter(t => t.type==='expense' && new Date(t.date)>=weekAgo).reduce((s,t)=>s+t.amount,0);
                const prevWeekExp = txs.filter(t => { const d=new Date(t.date); return t.type==='expense' && d>=prevWeek && d<weekAgo; }).reduce((s,t)=>s+t.amount,0);

                let insights = [];
                if (prevWeekExp > 0 && thisWeekExp > prevWeekExp * 1.3) {
                    insights.push(ai('insight_week_high', thisWeekExp.toLocaleString(), Math.round((thisWeekExp/prevWeekExp-1)*100)));
                }

                const catThisWeek = {};
                txs.filter(t => t.type==='expense' && new Date(t.date)>=weekAgo).forEach(t => { catThisWeek[t.cat]=(catThisWeek[t.cat]||0)+t.amount; });
                const catPrevWeek = {};
                txs.filter(t => { const d=new Date(t.date); return t.type==='expense' && d>=prevWeek && d<weekAgo; }).forEach(t => { catPrevWeek[t.cat]=(catPrevWeek[t.cat]||0)+t.amount; });

                for(let k in catThisWeek) {
                    if (catPrevWeek[k] && catThisWeek[k] > catPrevWeek[k] * 2) {
                        const label = (EXPENSE_CATS[k]||{label:k}).label;
                        insights.push(ai('insight_cat_spike', label, catThisWeek[k].toLocaleString(), (catThisWeek[k]/catPrevWeek[k]).toFixed(1)));
                    }
                }

                if (insights.length === 0) insights.push(ai('insight_normal'));
                return `<span class="text-white font-bold">${ai('insight_title')}</span><br><br>` + insights.map(i => `• ${i}`).join('<br>');
            }

            // === Feature 11: 月报/总结 ===
            if (text.match(/(总结|月报|summary|报告|report|まとめ|요약)/i)) {
                return generateSummary();
            }

            // === Feature 13: 消费预测 ===
            if (text.match(/(预测|预计|forecast|predict|月末|估计|予測|예측)/i)) {
                return getSpendingForecast();
            }

            // === Feature 12: 对话查询 ===
            const queryResult = handleQuery(text);
            if (queryResult.matched) return queryResult.response;

            return ai('fallback');
        }

        // === Pro AI (Multi-provider LLM) ===
        let proConversation = [];
        let lastFailedMsg = '';
        const PRO_PROVIDERS = {
            gemini: { name: 'Gemini', models: ['gemini-2.5-flash','gemini-2.0-flash','gemini-2.5-pro'] },
            qwen: { name: '通义千问', models: ['qwen-plus','qwen-turbo','qwen-max','qwen3-235b-a22b'] },
            custom: { name: '自定义', models: [] }
        };

        function getProConfig() {
            const cfg = JSON.parse(nfStorage.getItem('pro_config') || '{}');
            if (!cfg.key && nfStorage.getItem('gemini_api_key') && nfStorage.getItem('pro_ai_enabled') === '1') {
                cfg.key = nfStorage.getItem('gemini_api_key');
                cfg.provider = 'gemini';
                cfg.model = 'gemini-2.0-flash';
                nfStorage.setItem('pro_config', JSON.stringify(cfg));
            }
            return cfg;
        }
        function isProActive() {
            const cfg = getProConfig();
            return !!cfg.key && !!cfg.provider && nfStorage.getItem('pro_ai_enabled') === '1';
        }

        function openProUnlock() {
            const cfg = getProConfig();
            const isActive = isProActive();
            const curProvider = cfg.provider || 'gemini';
            const providerOptions = Object.entries(PRO_PROVIDERS).map(([k,v]) =>
                `<option value="${k}" ${k===curProvider?'selected':''}>${v.name}</option>`
            ).join('');
            const html = `
                <div onclick="event.target===this&&closeProPanel()" class="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm flex items-end justify-center animate-fade-in">
                    <div class="w-full max-w-[500px] bg-[#1a1a24] rounded-t-[28px] p-6 animate-slide-up">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-[18px] font-semibold text-white flex items-center gap-2"><i data-lucide="wand-sparkles" class="w-5 h-5 text-white"></i>${t('pro_title')}</h3>
                            <button onclick="closeProPanel()" class="w-8 h-8 flex items-center justify-center rounded-full bg-white/5"><i data-lucide="x" class="w-4 h-4 text-white/60"></i></button>
                        </div>
                        <p class="text-[14px] text-white/50 mb-4">${t('pro_desc')}</p>
                        <label class="text-[13px] text-white/40 mb-1 block">${t('pro_provider_label')}</label>
                        <div class="relative mb-3">
                            <select id="pro-provider" onchange="onProProviderChange()" class="w-full bg-white/5 border-0 rounded-xl px-4 py-3 pr-10 text-[15px] text-white focus:outline-none appearance-none">
                                ${providerOptions}
                            </select>
                            <i data-lucide="chevron-down" class="w-4 h-4 text-white/40 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"></i>
                        </div>
                        <label class="text-[13px] text-white/40 mb-1 block" id="pro-model-label">${t('pro_model_label')}</label>
                        <div class="relative mb-3" id="pro-model-wrap">
                            <select id="pro-model" class="w-full bg-white/5 border-0 rounded-xl px-4 py-3 pr-10 text-[15px] text-white focus:outline-none appearance-none">
                            </select>
                            <i data-lucide="chevron-down" class="w-4 h-4 text-white/40 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"></i>
                        </div>
                        <div id="pro-custom-url-wrap" class="hidden mb-3">
                            <label class="text-[13px] text-white/40 mb-1 block">API Base URL</label>
                            <input id="pro-custom-url" type="text" value="${cfg.customUrl||''}" placeholder="https://api.example.com/v1" class="w-full bg-white/5 border-0 rounded-xl px-4 py-3 text-[15px] text-white placeholder:text-white/25 focus:outline-none">
                        </div>
                        <div id="pro-custom-model-wrap" class="hidden mb-3">
                            <label class="text-[13px] text-white/40 mb-1 block">${t('pro_model_name')}</label>
                            <input id="pro-custom-model" type="text" value="${cfg.customModel||''}" placeholder="model-name" class="w-full bg-white/5 border-0 rounded-xl px-4 py-3 text-[15px] text-white placeholder:text-white/25 focus:outline-none">
                        </div>
                        <label class="text-[13px] text-white/40 mb-1 block">API Key</label>
                        <input id="pro-key-input" type="password" value="${cfg.key||''}" placeholder="${t('pro_placeholder')}" class="w-full bg-white/5 border-0 rounded-xl px-4 py-3 text-[15px] text-white placeholder:text-white/25 focus:outline-none mb-3">
                        <div id="pro-help-card" class="rounded-2xl bg-white/[0.03] p-4 mb-5">
                            <div class="flex items-center gap-2 mb-2">
                                <span id="pro-help-badge" class="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[12px] font-normal">免费</span>
                                <span id="pro-help-quota" class="text-[13px] text-white/60 font-normal">15次/分 · 1500次/天</span>
                            </div>
                            <div id="pro-help-steps" class="text-[13px] text-white/45 leading-[1.8] font-normal mb-3"></div>
                            <a id="pro-help-link" href="#" target="_blank" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-purple/15 text-cyber-purple text-[13px] font-normal active:scale-95 transition-transform"><i data-lucide="external-link" class="w-3.5 h-3.5"></i><span id="pro-help-link-text">前往获取</span></a>
                        </div>
                        <div class="flex gap-3">
                            ${isActive ? `<button id="pro-btn-clear" class="flex-1 py-3 rounded-full bg-white/5 text-white/60 text-[15px] font-medium active:scale-95 transition-transform">${t('pro_clear')}</button>` : ''}
                            <button id="pro-btn-save" class="flex-1 py-3 rounded-full bg-cyber-purple text-white text-[15px] font-medium active:scale-95 transition-transform">${t('pro_save')}</button>
                        </div>
                    </div>
                </div>`;
            const el = document.createElement('div');
            el.id = 'pro-panel';
            el.innerHTML = html;
            document.body.appendChild(el);
            document.getElementById('pro-btn-save').addEventListener('click', saveProKey);
            const clearBtn = document.getElementById('pro-btn-clear');
            if (clearBtn) clearBtn.addEventListener('click', clearProKey);
            lucide.createIcons();
            onProProviderChange();
        }
        function getProHelpData() {
            const isZh = currentLang === 'zh';
            const isJa = currentLang === 'ja';
            const isKo = currentLang === 'ko';
            const go = isZh ? '前往' : isJa ? '' : isKo ? '' : 'Go to';
            const free = isZh ? '免费' : isJa ? '無料' : isKo ? '무료' : 'Free';
            const paid = isZh ? '付费' : isJa ? '有料' : isKo ? '유료' : 'Paid';
            const limited = isZh ? '限免' : isJa ? '期間限定' : isKo ? '한정 무료' : 'Trial';
            const cheap = isZh ? '超便宜' : isJa ? '格安' : isKo ? '초저가' : 'Cheap';
            const step1Open = isZh ? '打开下方链接' : isJa ? '下のリンクを開く' : isKo ? '아래 링크 열기' : 'Open the link below';
            const step4Copy = isZh ? '复制 Key 粘贴到上方输入框' : isJa ? 'Keyをコピーして上に貼り付け' : isKo ? 'Key를 복사하여 위에 붙여넣기' : 'Copy Key and paste above';
            return {
                gemini: {
                    url: 'https://aistudio.google.com/apikey',
                    urlLabel: `${go} Google AI Studio`,
                    quota: isZh ? '免费 15次/分 · 1500次/天' : isJa ? '無料 15回/分 · 1500回/日' : isKo ? '무료 15회/분 · 1500회/일' : 'Free 15 req/min · 1500 req/day',
                    badge: free, badgeColor: 'emerald',
                    steps: isZh ? ['1. 打开下方链接，用 Google 账号登录', '2. 点击 "Create API Key"', '3. 选择项目（或新建）→ 生成 Key', '4. 复制 Key 粘贴到上方输入框'] :
                           isJa ? ['1. 下のリンクを開き、Googleアカウントでログイン', '2. "Create API Key" をクリック', '3. プロジェクトを選択 → Key生成', '4. Keyをコピーして上に貼り付け'] :
                           isKo ? ['1. 아래 링크를 열고 Google 계정으로 로그인', '2. "Create API Key" 클릭', '3. 프로젝트 선택 → Key 생성', '4. Key를 복사하여 위에 붙여넣기'] :
                           ['1. Open the link below, sign in with Google', '2. Click "Create API Key"', '3. Select a project → Generate Key', '4. Copy Key and paste above']
                },
                qwen: {
                    url: 'https://bailian.console.aliyun.com/cn-beijing?tab=model#/api-key',
                    urlLabel: isZh ? '前往百炼平台' : `${go} Bailian Platform`,
                    quota: isZh ? '免费至 2026.9.27' : isJa ? '2026.9.27まで無料' : isKo ? '2026.9.27까지 무료' : 'Free until 2026.9.27',
                    badge: free, badgeColor: 'emerald',
                    steps: isZh ? ['1. 打开下方链接，登录阿里云账号', '2. 点 "创建API-KEY"', '3. 复制 Key 粘贴到上方'] :
                           isJa ? ['1. 下のリンクを開き、ログイン', '2. "API-KEY作成" をクリック', '3. Keyをコピーして上に貼り付け'] :
                           isKo ? ['1. 아래 링크를 열고 로그인', '2. "API-KEY 생성" 클릭', '3. Key를 복사하여 위에 붙여넣기'] :
                           ['1. Open the link, sign in to Alibaba Cloud', '2. Click "Create API-KEY"', '3. Copy Key and paste above']
                },
                custom: { url: '', urlLabel: '', quota: '', badge: '', steps: [] }
            };
        }
        function onProProviderChange() {
            const provider = document.getElementById('pro-provider').value;
            const modelSel = document.getElementById('pro-model');
            const modelLabel = document.getElementById('pro-model-label');
            const modelWrap = document.getElementById('pro-model-wrap');
            const cfg = getProConfig();
            const models = PRO_PROVIDERS[provider]?.models || [];
            const keyInput = document.getElementById('pro-key-input');
            if (keyInput) {
                const savedKeys = JSON.parse(nfStorage.getItem('pro_keys') || '{}');
                keyInput.value = savedKeys[provider] || (provider === cfg.provider ? (cfg.key || '') : '');
            }
            const customUrlWrap = document.getElementById('pro-custom-url-wrap');
            const customModelWrap = document.getElementById('pro-custom-model-wrap');
            if (provider === 'custom') {
                customUrlWrap.classList.remove('hidden');
                customModelWrap.classList.remove('hidden');
                modelLabel.style.display = 'none';
                modelWrap.style.display = 'none';
            } else {
                customUrlWrap.classList.add('hidden');
                customModelWrap.classList.add('hidden');
                modelLabel.style.display = '';
                modelWrap.style.display = '';
                modelSel.innerHTML = models.map(m => `<option value="${m}" ${m===cfg.model?'selected':''}>${m}</option>`).join('');
            }
            const helpCard = document.getElementById('pro-help-card');
            const helpData = getProHelpData()[provider];
            if (helpCard && helpData) {
                if (!helpData.url) {
                    helpCard.style.display = 'none';
                } else {
                    helpCard.style.display = '';
                    const colorMap = { emerald: 'bg-emerald-500/15 text-emerald-400', amber: 'bg-amber-500/15 text-amber-400', blue: 'bg-blue-500/15 text-blue-400' };
                    document.getElementById('pro-help-badge').className = `px-2 py-0.5 rounded-md text-[12px] font-normal ${colorMap[helpData.badgeColor] || colorMap.emerald}`;
                    document.getElementById('pro-help-badge').textContent = helpData.badge;
                    document.getElementById('pro-help-quota').textContent = helpData.quota;
                    document.getElementById('pro-help-steps').innerHTML = helpData.steps.map(s => `<div>${s}</div>`).join('');
                    document.getElementById('pro-help-link').href = helpData.url;
                    document.getElementById('pro-help-link-text').textContent = helpData.urlLabel;
                }
            }
        }
        function closeProPanel() {
            const el = document.getElementById('pro-panel');
            if (el) el.remove();
        }
        function saveProKey() {
            try {
            const key = document.getElementById('pro-key-input')?.value.trim();
            if (!key) { showToast(t('pro_no_key') || '请先粘贴 API Key', 'error'); return; }
            const provider = document.getElementById('pro-provider')?.value;
            if (!provider) { showToast('请选择供应商', 'error'); return; }
            const model = provider === 'custom' ? (document.getElementById('pro-custom-model')?.value.trim() || 'gpt-4o-mini') : document.getElementById('pro-model')?.value;
            if (!model) { showToast('请选择模型', 'error'); return; }
            const cfg = { key, provider, model };
            if (provider === 'custom') {
                cfg.customUrl = document.getElementById('pro-custom-url')?.value.trim();
                cfg.customModel = cfg.model;
            }
            nfStorage.setItem('pro_config', JSON.stringify(cfg));
            const savedKeys = JSON.parse(nfStorage.getItem('pro_keys') || '{}');
            savedKeys[provider] = key;
            nfStorage.setItem('pro_keys', JSON.stringify(savedKeys));
            if (provider === 'gemini') {
                nfStorage.setItem('gemini_api_key', key);
            }
            nfStorage.setItem('pro_ai_enabled', '1');
            updateProStatus();
            closeProPanel();
            proConversation = [];
            showToast(t('pro_activated'), 'success');
            } catch(e) { showToast('激活失败: ' + e.message, 'error'); }
        }
        function clearProKey() {
            nfStorage.removeItem('pro_ai_enabled');
            proConversation = [];
            updateProStatus();
            closeProPanel();
            showToast(t('pro_cleared'));
        }
        function updateProStatus() {
            const label = document.getElementById('pro-status-label');
            if (label) {
                const cfg = getProConfig();
                if (isProActive()) {
                    const pName = PRO_PROVIDERS[cfg.provider]?.name || cfg.provider;
                    label.textContent = pName;
                    label.className = 'text-[16px] font-normal text-white/35';
                } else {
                    label.textContent = t('pro_locked');
                    label.className = 'text-[16px] font-normal text-white/35';
                }
            }
            const chip = document.getElementById('pro-chip-btn');
            if (chip) {
                chip.style.display = 'flex';
                const chipIcon = chip.querySelector('[data-lucide]');
                if (chipIcon) {
                    if (isProActive()) {
                        chipIcon.style.color = '#a78bfa';
                    } else {
                        chipIcon.style.color = '';
                    }
                }
            }
        }

        async function callLLMProvider(systemPrompt, messages) {
            const cfg = getProConfig();
            const { key, provider, model } = cfg;

            if (provider === 'gemini') {
                const geminiMsgs = messages.map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                }));
                const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${key}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                        contents: geminiMsgs
                    })
                });
                if (!resp.ok) throw { status: resp.status, data: await resp.json().catch(()=>({})) };
                const data = await resp.json();
                return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            }

            // OpenAI-compatible: qwen, custom
            const urlMap = {
                qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
                custom: (cfg.customUrl || '').replace(/\/+$/, '') + '/chat/completions'
            };
            const url = urlMap[provider] || urlMap.qwen;
            const body = {
                model: model,
                messages: [{ role: 'system', content: systemPrompt }, ...messages.map(m => ({ role: m.role, content: m.content }))],
                temperature: 0.7
            };
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify(body)
            });
            if (!resp.ok) throw { status: resp.status, data: await resp.json().catch(()=>({})) };
            const data = await resp.json();
            return data?.choices?.[0]?.message?.content?.trim() || '';
        }

        async function processAIWithLLM(text) {
            if (pendingAction) {
                return processAI(text);
            }
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            const allCats = Object.entries({...EXPENSE_CATS, ...INCOME_CATS}).map(([k,v]) => `${k}(${v.label})`).join(', ');

            const recentTxs = txs.slice(-20).map(tx => {
                const d = new Date(tx.date);
                return `${d.getMonth()+1}/${d.getDate()} ${tx.type==='income'?'+':'-'}${tx.amount} ${tx.desc||''} [${tx.cat}]`;
            }).join('\n');

            const monthTxs = txs.filter(tx => { const d=new Date(tx.date); return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear(); });
            const monthExp = monthTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
            const monthInc = monthTxs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);

            const catSummary = {};
            monthTxs.filter(t=>t.type==='expense').forEach(t => { catSummary[t.cat] = (catSummary[t.cat]||0) + t.amount; });
            const catBreakdown = Object.entries(catSummary).sort((a,b)=>b[1]-a[1]).map(([k,v]) => `${(EXPENSE_CATS[k]||{}).label||k}: ${v.toFixed(2)}`).join(', ');

            const budgetInfo = totalBudget > 0 ? `Total budget: ${totalBudget}` : 'No total budget set';
            const catBudgets = Object.entries(budgets).map(([k,v]) => `${k}:${v}`).join(', ');

            const langHint = currentLang === 'zh' ? '用中文回复' : currentLang === 'ja' ? '用日语回复' : currentLang === 'ko' ? '用韩语回复' : 'Reply in English';
            const systemPrompt = `You are a smart bookkeeping assistant with a fun personality. Users chat with you to record, query, edit, or delete transactions.

Current date: ${todayStr}
This month expense: ${monthExp.toFixed(2)}, income: ${monthInc.toFixed(2)}
This month expense by category (ACCURATE data, use these numbers): ${catBreakdown || 'none'}
Budget: ${budgetInfo}${catBudgets ? ', Category budgets: ' + catBudgets : ''}
Available categories: ${allCats}
Recent records:
${recentTxs || 'None'}

You MUST return pure JSON (no markdown code blocks):
{"action":"record|query|delete|modify|budget|chat","data":{...},"reply":"your reply to user"}

Actions:
- record: Add a transaction. data: {"amount":number,"type":"expense|income","cat":"category key","desc":"description","date":"YYYY-MM-DD"}
- query: Query transactions. data: {"period":"today|week|month|year|all","type":"expense|income|all","cat":"category key or empty"}. Put the natural language summary in reply.
- delete: Delete records. data: {"match":"matching keyword from desc or amount"}. Do NOT actually delete — ask for confirmation in reply.
- modify: Modify a record. data: {"match":"matching condition","changes":{}}. Confirm in reply.
- category: Manage categories. data: {"op":"add|delete|rename","type":"expense|income","key":"category_key","label":"display name","icon":"lucide icon name","color":"hex color","newLabel":"new name (for rename)"}
- chat: Casual chat or unsupported requests. data:{}.

IMPORTANT RULES:
- ${langHint}
- Amount must be a positive number (absolute value). If user says "56.11-6.34", compute 56.11-6.34=49.77 and use 49.77.
- desc should be a SHORT label (merchant/item name like "小象超市", "星巴克", "绫波丽"), NOT the full input text or math expression. Strip numbers and verbs.
- Keep replies short and fun.
- You can do: record, query, delete, modify, budget, category. You CANNOT: clear all data, export files, change app language/theme, or modify the app itself. For unsupported things, tell user to do it in app settings.
- NEVER pretend you performed an action you cannot do.
- For "delete all" or "clear all data" requests, use action "delete" with data: {"match":"__ALL__"}. Always ask for confirmation first.
- budget: Set/modify/remove budget. data: {"type":"total|category","cat":"category key (if type=category)","amount":number or 0 to remove}
- category: For adding, use a simple lowercase key (e.g. "milk_tea"). For deleting or renaming, match existing category keys. Default icon: "tag", default color: "#7c3aed".
- Default type is "expense". Only use "income" when user EXPLICITLY says income words (收入/工资/薪水/奖金/赚了/进账/到账/转入/red packet received). If ambiguous, always default to expense.
- Category selection: choose the category whose meaning best matches what the item IS, not just "something you buy". E.g. a clock/watch → 购物 or 日用; a toy/figure/collectible → 玩具. Don't put non-toy items into 玩具 just because the category exists.
- For record/modify replies, keep it fun and witty (1-2 sentences, can be playful). For query results or warnings, be concise. Be creative with comments — tease, joke, use slang, reference pop culture.
- For record/modify actions, reply MUST mention: 1) amount with sign (expense use -, income use +) 2) category LABEL (e.g. 购物/餐饮/娱乐, NOT the desc) 3) desc. Weave into a fun sentence. Examples: "购物-50，绫波丽到手！剁手快乐～" / "餐饮-300，火锅真香！" / "salary +8000, payday!~". Never skip category label. IMPORTANT: expense MUST use minus sign "-", income MUST use plus sign "+".
- "改为X分类" or "移到X" or "换成X" means ONLY change the category, do NOT touch the description or amount. Only change what the user explicitly asks to change. Use the EXACT category name the user specified — do NOT substitute it with a similar existing category. E.g. "换成sofubi" → cat:"sofubi", NOT cat:"玩具". If the category doesn't exist, just use the user's name directly — the system will auto-create it.
- If user wants to move a record to a category that doesn't exist yet, return action "modify" with the new cat key — the system will auto-create unknown categories. NEVER map user's specified category name to a different existing category.
- NEVER ask for confirmation on modify actions. Just do it directly. Only ask confirmation for delete.`;

            proConversation.push({ role: 'user', content: text });
            if (proConversation.length > 8) proConversation = proConversation.slice(-6);

            try {
                const raw = await callLLMProvider(systemPrompt, proConversation);
                if (!raw) return ai('fallback');

                proConversation.push({ role: 'assistant', content: raw });

                let parsed;
                try {
                    const clean = raw.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim();
                    parsed = JSON.parse(clean);
                } catch(e) {
                    const replyMatch = raw.match(/"reply"\s*:\s*"([^"]+)"/);
                    if (replyMatch) return replyMatch[1];
                    return processAI(text);
                }

                if (parsed.action === 'record' && parsed.data) {
                    const d = parsed.data;
                    let rCat = d.cat || 'other';
                    if (!EXPENSE_CATS[rCat] && !INCOME_CATS[rCat]) {
                        const matched = parseCategoryForAI(rCat) || fuzzyMatchCat(rCat, d.type || 'expense');
                        rCat = matched ? matched.key : 'other';
                    }
                    if (rCat === 'other' && d.desc) {
                        const betterCat = parseCategoryForAI(d.desc) || parseCategoryForAI(text);
                        if (betterCat) rCat = betterCat.key;
                    }
                    let rType = d.type || 'expense';
                    if (rType === 'income' && EXPENSE_CATS[rCat]) rType = 'expense';
                    if (Number(d.amount) < 0) rType = 'expense';
                    const tx = {
                        id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
                        amount: Math.abs(Number(d.amount)),
                        type: rType,
                        cat: rCat,
                        desc: d.desc || '',
                        date: d.date ? new Date(d.date + 'T12:00:00').toISOString() : new Date().toISOString()
                    };
                    pushUndo('delete', tx);
                    txs.push(tx);
                    lastAiTxId = tx.id;
                    renderAll();
                    checkAchievements();
                    const catLabel = (EXPENSE_CATS[tx.cat] || INCOME_CATS[tx.cat] || {}).label || tx.cat;
                    const fallbackReply = currentLang === 'zh' ? `已记录: ${tx.type==='income'?'收入':'支出'}${tx.amount}元，分类：${catLabel}，备注：${tx.desc||'无'}` : `Recorded: ${tx.type} ${tx.amount}, cat: ${catLabel}, note: ${tx.desc||'none'}`;
                    return parsed.reply || fallbackReply;
                }

                if (parsed.action === 'query' && parsed.data) {
                    return parsed.reply || '查询完成';
                }

                if (parsed.action === 'delete' && parsed.data) {
                    const match = parsed.data.match;
                    if (match) {
                        const found = match === '__ALL__' ? [...txs] : txs.filter(tx => (tx.desc && tx.desc.includes(match)) || String(tx.amount) === match || tx.cat === match);
                        if (found.length > 0) {
                            pendingAction = { type: 'batch-delete', payload: found };
                            const confirmHint = currentLang === 'zh' ? '确认请说"确认"' : currentLang === 'ja' ? '「確認」と言ってください' : currentLang === 'ko' ? '"확인"이라고 말해주세요' : 'Say "confirm" to proceed';
                            return (parsed.reply || `${found.length} records found`) + `<br><br>${confirmHint}`;
                        }
                    }
                    return parsed.reply || (currentLang === 'zh' ? '没有找到匹配的记录' : 'No matching records found');
                }

                if (parsed.action === 'modify' && parsed.data) {
                    const d = parsed.data;
                    const match = d.match || '';
                    let found = null;
                    if (match) {
                        found = txs.find(tx => (tx.desc && tx.desc.includes(match)) || String(tx.amount) === match || tx.id === match || tx.cat === match);
                    }
                    if (!found && match) {
                        found = txs.find(tx => tx.desc && (tx.desc.includes(match) || match.includes(tx.desc)));
                    }
                    if (!found && lastAiTxId) {
                        found = txs.find(tx => tx.id === lastAiTxId);
                    }
                    if (!found && match) {
                        const words = match.replace(/[\d.]+/g,'').split(/\s+/).filter(w => w.length > 0);
                        found = txs.find(tx => words.some(w => tx.desc && tx.desc.includes(w)));
                    }
                    if (!found) {
                        found = txs[txs.length - 1];
                    }
                    const changes = d.changes || d;
                    if (found && (changes.amount !== undefined || changes.cat || changes.desc || changes.type || changes.date)) {
                        pushUndo('modify', {...found});
                        if (changes.amount !== undefined) found.amount = Math.abs(Number(changes.amount));
                        if (changes.cat) {
                            let catKey = changes.cat;
                            if (!EXPENSE_CATS[catKey] && !INCOME_CATS[catKey]) {
                                const fuzzy = parseCategoryForAI(catKey) || fuzzyMatchCat(catKey, found.type);
                                if (fuzzy) { catKey = fuzzy.key; }
                                else {
                                    const cats = found.type === 'income' ? INCOME_CATS : EXPENSE_CATS;
                                    cats[catKey] = { label: catKey.charAt(0).toUpperCase() + catKey.slice(1), icon: 'tag', color: '#7c3aed' };
                                    saveCustomCats();
                                }
                            }
                            found.cat = catKey;
                        }
                        if (changes.desc) found.desc = changes.desc;
                        if (changes.type) found.type = changes.type;
                        if (changes.date) found.date = new Date(changes.date + 'T12:00:00').toISOString();
                        renderAll();
                        const modCatLabel = (EXPENSE_CATS[found.cat] || INCOME_CATS[found.cat] || {}).label || found.cat;
                        const modFallback = currentLang === 'zh' ? `已修改: ${found.type==='income'?'收入':'支出'}${found.amount}元，分类：${modCatLabel}，备注：${found.desc||'无'}` : `Updated: ${found.type} ${found.amount}, cat: ${modCatLabel}, note: ${found.desc||'none'}`;
                        return parsed.reply || modFallback;
                    }
                    return currentLang === 'zh' ? '没有找到匹配的记录' : 'No matching records found';
                }

                if (parsed.action === 'budget' && parsed.data) {
                    const d = parsed.data;
                    const amt = Number(d.amount) || 0;
                    if (d.type === 'total') {
                        totalBudget = amt;
                        nfStorage.setItem(getTotalBudgetKey(), totalBudget);
                        renderAll();
                        checkAchievements({ action: 'budget_set' });
                    } else if (d.type === 'category' && d.cat) {
                        if (amt > 0) {
                            budgets[d.cat] = amt;
                        } else {
                            delete budgets[d.cat];
                        }
                        saveBudgets();
                        renderAll();
                        checkAchievements({ action: 'budget_set' });
                    }
                    return parsed.reply || (amt > 0 ? `Budget set: ${amt}` : 'Budget removed');
                }

                if (parsed.action === 'category' && parsed.data) {
                    const d = parsed.data;
                    const catType = d.type || 'expense';
                    const cats = catType === 'income' ? INCOME_CATS : EXPENSE_CATS;

                    if (d.op === 'add' && d.key && d.label) {
                        cats[d.key] = { label: d.label, icon: d.icon || 'tag', color: d.color || '#7c3aed' };
                        saveCustomCats();
                        renderAll();
                        return parsed.reply || `Category "${d.label}" added`;
                    }
                    if (d.op === 'delete' && d.key) {
                        const label = cats[d.key]?.label || d.key;
                        delete cats[d.key];
                        saveCustomCats();
                        renderAll();
                        return parsed.reply || `Category "${label}" removed`;
                    }
                    if (d.op === 'rename' && d.key && d.newLabel) {
                        if (cats[d.key]) {
                            cats[d.key].label = d.newLabel;
                            saveCustomCats();
                            renderAll();
                            return parsed.reply || `Category renamed to "${d.newLabel}"`;
                        }
                        return parsed.reply || 'Category not found';
                    }
                    return parsed.reply || 'Category operation failed';
                }

                return parsed.reply || raw;
            } catch(e) {
                lastFailedMsg = text;
                const retryBtn = `<button onclick="retryLastMsg()" class="mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/10 text-white/70 text-[12px] active:scale-95 transition-transform"><i data-lucide="refresh-cw" class="w-3 h-3"></i>${currentLang === 'zh' ? '重试' : 'Retry'}</button>`;
                const proBtn = `<button onclick="openProUnlock()" class="mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-cyber-purple/20 text-cyber-purple text-[12px] active:scale-95 transition-transform"><i data-lucide="settings" class="w-3 h-3"></i>${t('pro_error_switch')}</button>`;
                if (e?.status === 401 || e?.status === 403) {
                    nfStorage.removeItem('pro_ai_enabled');
                    updateProStatus();
                    return t('pro_error_invalid');
                }
                if (e?.status === 429) {
                    nfStorage.removeItem('pro_ai_enabled');
                    updateProStatus();
                    const offlineReply = processAI(text);
                    return `<span class="text-[12px] text-white/40">${t('pro_error_rate_limit')}</span><br><br>` + offlineReply;
                }
                const cfg = getProConfig();
                const needVpn = (cfg.provider === 'gemini');
                const hint = needVpn ? `<br><span class="text-[12px] text-white/30">${t('pro_error_vpn_hint')}</span>` : '';
                return `${t('pro_error_failed')}${hint}<br>${retryBtn} ${proBtn}<br><br>` + processAI(text);
            }
        }

        function retryLastMsg() {
            if (!lastFailedMsg) return;
            const text = lastFailedMsg;
            lastFailedMsg = '';
            const box = document.getElementById('chat-box');
            box.innerHTML += `<div class="ai-typing-indicator flex justify-start mb-4"><div class="glass-card text-white/50 px-4 py-3 rounded-[24px] rounded-tl-sm text-[14px] border-0 shadow-lg">${t('pro_thinking')}</div></div>`;
            box.scrollTop = box.scrollHeight;
            processAIWithLLM(text).then(aiRes => {
                const typing = document.querySelector('.ai-typing-indicator');
                if (typing) typing.remove();
                box.innerHTML += `<div class="flex justify-start mb-4"><div class="glass-card text-white/90 px-4 py-3 rounded-[24px] rounded-tl-sm text-[16px] border-0 shadow-lg">${aiRes}</div></div>`;
                box.scrollTop = box.scrollHeight;
                lucide.createIcons();
            });
        }

        // === Feature 1: Finish recording (shared by direct record + multi-turn) ===
        function finishRecord(params) {
            let { timeInfo, text, cleanText, amountText, numMatch, amount, catInfo } = params;

            // If coming from multi-turn, some params may need re-derivation
            if (!text) text = '';
            if (!numMatch && amount) numMatch = [String(amount)];

            let targetDate = new Date();
            if(timeInfo) {
                targetDate = new Date(timeInfo.start);
                const now = new Date();
                if(targetDate.toDateString() === now.toDateString()) {
                    targetDate = now;
                } else {
                    targetDate.setHours(12, 0, 0, 0);
                }
            }

            let desc = (amountText || '')
                .replace(numMatch ? numMatch[0] : '', '')
                .replace(/(花了|买了|for|spent|块钱|块|元|入账|充了|付了|交了|吧)/g, '')
                .replace(/^(花|买|赚了|赚)\s*/, '')
                .replace(/^(吃|喝)(了)?(个|杯|份|碗|瓶|顿|次)?\s*/, '')
                .replace(/^在\s*/, '')
                .replace(/^(给|跟|和)\s*/, '')
                .replace(/(买了?|充了?|付了?|转了?|发了?)/g, '')
                .replace(/(花了?|用了?|付了?|共|一共|总共|人均)\s*$/, '')
                .trim();
            desc = desc.replace(/[零一二两三四五六七八九十百千万亿半]+[块元]?/g, '').trim();
            // "在星巴克花了45" → extract location as desc
            if (!desc && amountText) {
                const locMatch = amountText.match(/在(.+?)(?:花|消费|用|付|吃|喝)/);
                if (locMatch) desc = locMatch[1].trim();
            }

            let cat = 'other';
            let type = 'expense';

            if (catInfo) {
                cat = catInfo.key;
                if(!desc) desc = catInfo.label;
            }

            if (cat === 'other') {
                const reCat = parseCategoryForAI(text);
                if (reCat) { cat = reCat.key; if(!desc) desc = reCat.label; }
            }
            // Fallback: if still "other", check if desc exactly matches a category label
            if (cat === 'other' && desc) {
                const allC = {...EXPENSE_CATS, ...INCOME_CATS};
                for (let k in allC) {
                    if (allC[k].label.trim() === desc.trim()) { cat = k; break; }
                }
            }

            if (text.match(/(收入|赚了|赚|入账|工资|奖金|理财|捡了|中了|中奖|彩票|红包|退款|报销)/)) {
                type = 'income';
                if (cat === 'other') {
                    if(text.match(/工资/)) { cat = 'salary'; if(!desc) desc = '工资'; }
                    else if(text.match(/(奖金|年终)/)) { cat = 'bonus'; if(!desc) desc = (text.match(/(奖金|年终奖?)/)||['奖金'])[0]; }
                    else if(text.match(/(理财|利息|分红)/)) { cat = 'investment'; if(!desc) desc = (text.match(/(理财收益|利息|分红|理财)/)||['理财收益'])[0]; }
                    else if(text.match(/(兼职|副业|外快)/)) { cat = 'other_in'; if(!desc) desc = (text.match(/(兼职|副业|外快)/)||['兼职收入'])[0]; }
                    else if(text.match(/(红包|转账)/)) { cat = 'other_in'; if(!desc) desc = (text.match(/(红包|转账)/)||['红包'])[0]; }
                    else { cat = 'other_in'; if(!desc) desc = '收入'; }
                }
            }

            // Smart desc: if still generic, try to extract meaningful words from original text
            if(!desc || desc === '收入' || desc === '支出') {
                const meaningful = (cleanText || '')
                    .replace(/[零一二两三四五六七八九十百千万\d.]+/g, '')
                    .replace(/(花了|花|买了|买|赚了|赚|收入|支出|入账|块钱|块|元|吧|了|的)/g, '')
                    .trim();
                if (meaningful && meaningful.length <= 10) {
                    desc = meaningful;
                } else if (!desc) {
                    const catObj = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
                    desc = (catObj[cat] || {label: type === 'income' ? '收入' : '消费'}).label;
                }
            }

            const newTx = { id: Date.now() + Math.floor(Math.random() * 10000), date: targetDate.toISOString(), desc, amount, cat, type };
            txs.push(newTx);
            pushUndo('add', {...newTx});
            lastAiTxId = newTx.id;
            checkStreak();
            const _lvlResult = addLevelXP('record');
            checkAchievements({ action: 'record', type, amount, cat, date: targetDate.toISOString() });
            renderAll();

            const catLabel = t('cat_' + cat) || (type === 'income' ? INCOME_CATS : EXPENSE_CATS)[cat]?.label || '';
            const descDisplay = desc === catLabel ? desc : `${desc} · ${catLabel}`;
            const recordedLabel = currentLang === 'zh' ? '已记：' : currentLang === 'ja' ? '記録：' : currentLang === 'ko' ? '기록:' : 'Recorded: ';
            const timeLabel = timeInfo ? (timeInfo.label === '昨天' ? t('yesterday') : timeInfo.label === '今天' ? t('today') : timeInfo.label) + ' ' : '';
            let response = `${recordedLabel}${timeLabel}${descDisplay} · <span class="text-teal-neon font-num">${amount.toLocaleString()}</span>`;

            const genericDescs = ['收入', '支出', '消费', '其他', 'income', 'expense', 'other'];
            if (genericDescs.includes(desc)) {
                const tipMsg = currentLang === 'zh' ? '说"改成XX"可修改备注' : currentLang === 'en' ? 'Say "change to XX" to edit note' : currentLang === 'ja' ? '「XX に変更」でメモ修正' : '"XX로 변경"으로 메모 수정';
                response += `<br><span class="text-white/35 text-xs"><i data-lucide="info" class="w-3 h-3 inline-block"></i> ${tipMsg}</span>`;
            }

            if (cat === 'other') {
                const customKeys = Object.keys(EXPENSE_CATS).filter(k => k.startsWith('custom_'));
                const customLabels = customKeys.map(k => EXPENSE_CATS[k].label).join('、') || '(无)';
                const askMsg = currentLang === 'zh' ? `这笔是什么类型的？（如：餐饮、交通、购物...）` : currentLang === 'en' ? `What category is this? (e.g. food, transport, shopping...)` : currentLang === 'ja' ? `カテゴリは？（食費、交通、買い物...）` : `어떤 카테고리인가요? (식비, 교통, 쇼핑...)`;
                response += `<br><span class="text-white/50 text-xs"><i data-lucide="tag" class="w-3 h-3 inline-block"></i> ${askMsg}</span>`;
            }

            // Feature 4: Budget warning
            response += checkBudgetAfterRecord(cat, type);
            // Feature 8: Anomaly detection (expenses only)
            if (type === 'expense') response += checkAnomaly(amount, cat);
            // Feature 9: Shortcut suggestion
            response += checkShortcutSuggestion(desc, amount, cat);
            // Feature 10: 消费吐槽
            if (type === 'expense') response += getSpendingRoast(cat, amount, desc);
            // Level up notification
            if (_lvlResult && _lvlResult.leveledUp) {
                response += `<br><span class="text-cyber-purple text-xs font-medium">${t('level_up')(_lvlResult.title)}</span>`;
            }

            return response;
        }

        const QUICK_DISPLAY = { export: {zh:'导出本月账单',en:'Export this month',ja:'今月をエクスポート',ko:'이번달 내보내기'}, summary: {zh:'总结',en:'Summary',ja:'まとめ',ko:'요약'} };
        function sendQuickChat(text) {
            const box = document.getElementById('chat-box');
            const displayText = QUICK_DISPLAY[text] ? (QUICK_DISPLAY[text][currentLang] || text) : text;
            box.innerHTML += `<div class="flex justify-end mb-4"><div class="bg-cyber-purple text-white px-4 py-3 rounded-[24px] rounded-tr-sm text-[16px] font-medium shadow-[0_0_15px_rgba(124,58,237,0.3)]">${displayText}</div></div>`;
            const chips = document.getElementById('chat-quick-chips');
            if (chips) chips.style.display = 'none';

            if (isProActive()) {
                box.innerHTML += `<div class="ai-typing-indicator" class="flex justify-start mb-4"><div class="glass-card text-white/50 px-4 py-3 rounded-[24px] rounded-tl-sm text-[14px] border-0 shadow-lg">${t('pro_thinking')}</div></div>`;
                box.scrollTop = box.scrollHeight;
                processAIWithLLM(text).then(aiRes => {
                    const typing = document.querySelector('.ai-typing-indicator');
                    if (typing) typing.remove();
                    box.innerHTML += `<div class="flex justify-start mb-4"><div class="glass-card text-white/90 px-4 py-3 rounded-[24px] rounded-tl-sm text-[16px] border-0 shadow-lg">${aiRes}</div></div>`;
                    box.scrollTop = box.scrollHeight;
                    lucide.createIcons();
                });
            } else {
                setTimeout(() => {
                    const aiRes = processAI(text);
                    box.innerHTML += `<div class="flex justify-start mb-4"><div class="glass-card text-white/90 px-4 py-3 rounded-[24px] rounded-tl-sm text-[16px] border-0 shadow-lg ">${aiRes}</div></div>`;
                    box.scrollTop = box.scrollHeight;
                    lucide.createIcons();
                }, 600);
            }
        }

        function handleSend(e) {
            e.preventDefault();
            const input = document.getElementById('chat-input');
            const txt = input.value.trim();
            if(!txt) return;
            const box = document.getElementById('chat-box');
            box.innerHTML += `<div class="flex justify-end mb-4"><div class="bg-cyber-purple text-white px-4 py-3 rounded-[24px] rounded-tr-sm text-[16px] font-medium shadow-[0_0_15px_rgba(124,58,237,0.3)]">${escHtml(txt)}</div></div>`;
            input.value = '';
            const chips = document.getElementById('chat-quick-chips');
            if (chips) chips.style.display = 'none';

            if (isProActive()) {
                box.innerHTML += `<div class="ai-typing-indicator" class="flex justify-start mb-4"><div class="glass-card text-white/50 px-4 py-3 rounded-[24px] rounded-tl-sm text-[14px] border-0 shadow-lg">${t('pro_thinking')}</div></div>`;
                box.scrollTop = box.scrollHeight;
                processAIWithLLM(txt).then(aiRes => {
                    const typing = document.querySelector('.ai-typing-indicator');
                    if (typing) typing.remove();
                    box.innerHTML += `<div class="flex justify-start mb-4"><div class="glass-card text-white/90 px-4 py-3 rounded-[24px] rounded-tl-sm text-[16px] border-0 shadow-lg">${aiRes}</div></div>`;
                    box.scrollTop = box.scrollHeight;
                    lucide.createIcons();
                });
            } else {
                setTimeout(() => {
                    const aiRes = processAI(txt);
                    box.innerHTML += `<div class="flex justify-start mb-4"><div class="glass-card text-white/90 px-4 py-3 rounded-[24px] rounded-tl-sm text-[16px] border-0 shadow-lg ">${aiRes}</div></div>`;
                    box.scrollTop = box.scrollHeight;
                    lucide.createIcons();
                }, 600);
            }
        }


        // --- Core UI & Logic ---
        function renderAll() {
            saveTxs();
            let periodIncome = 0;
            let periodExpense = 0;
            let prevMonthlyExpense = 0;

            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            let prevMonth = currentMonth - 1;
            let prevYear = currentYear;
            if (prevMonth < 0) { prevMonth = 11; prevYear -= 1; }

            let filterStart, filterEnd, periodLabel, incomeLabel;
            const mode = dateFilterState.mode;
            const expWord = t('expense');
            const incWord = t('income');
            if (mode === 'month') {
                const [fy, fm] = (dateFilterState.value || '').split('-').map(Number);
                filterStart = new Date(fy, fm - 1, 1);
                filterEnd = new Date(fy, fm, 0, 23, 59, 59);
                periodLabel = (fy === currentYear && fm - 1 === currentMonth) ? t('month_expense') : (fy === currentYear ? `${fm}${currentLang==='zh'?'月':'/'}` : `${fy}.${fm}`) + ` ${expWord}`;
                incomeLabel = t('income');
            } else if (mode === 'year') {
                const fy = parseInt(dateFilterState.value);
                filterStart = new Date(fy, 0, 1);
                filterEnd = new Date(fy, 11, 31, 23, 59, 59);
                periodLabel = `${fy} ${expWord}`;
                incomeLabel = t('income');
            } else if (mode === 'day') {
                filterStart = new Date(dateFilterState.value + 'T00:00:00');
                filterEnd = new Date(dateFilterState.value + 'T23:59:59');
                const dy = filterStart.getFullYear(), dm = filterStart.getMonth() + 1, dd = filterStart.getDate();
                periodLabel = (dy === currentYear ? `${dm}/${dd}` : `${dy}.${dm}.${dd}`) + ` ${expWord}`;
                incomeLabel = t('income');
            } else if (mode === 'range') {
                filterStart = new Date(dateFilterState.start + 'T00:00:00');
                filterEnd = new Date(dateFilterState.end + 'T23:59:59');
                const sy = filterStart.getFullYear(), sm = filterStart.getMonth() + 1, sd = filterStart.getDate();
                const ey = filterEnd.getFullYear(), em = filterEnd.getMonth() + 1, ed = filterEnd.getDate();
                const rangeStart = sy === currentYear ? `${sm}/${sd}` : `${sy}.${sm}.${sd}`;
                const rangeEnd = ey === currentYear ? `${em}/${ed}` : `${ey}.${em}.${ed}`;
                periodLabel = `${rangeStart}-${rangeEnd} ${expWord}`;
                incomeLabel = t('income');
            } else {
                filterStart = new Date(currentYear, currentMonth, 1);
                filterEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
                periodLabel = t('month_expense');
                incomeLabel = t('income');
            }

            txs.forEach(t => {
                const d = new Date(t.date);
                if (d >= filterStart && d <= filterEnd) {
                    if (t.type === 'income') {
                        periodIncome += t.amount;
                    } else {
                        periodExpense += t.amount;
                    }
                }
                if (d.getMonth() === prevMonth && d.getFullYear() === prevYear) {
                    if (t.type === 'expense') prevMonthlyExpense += t.amount;
                }
            });

            const elMainExpense = document.getElementById('display-main-expense');
            const elTotalAssets = document.getElementById('display-total-assets');
            const elMonthlyIncome = document.getElementById('display-monthly-income');
            const elTrendBadge = document.getElementById('expense-trend-badge');
            const elPeriodLabel = document.getElementById('card-period-label');
            const elIncomeLabel = document.getElementById('card-income-label');

            const _curBook = books.find(b => b.id === currentBook);
            const bookName = _curBook ? getBookName(_curBook) : '';
            if (elPeriodLabel) { elPeriodLabel.innerText = periodLabel + (bookName ? ' · ' + bookName : ''); elPeriodLabel.removeAttribute('data-i18n'); }
            if (elIncomeLabel) { elIncomeLabel.innerText = incomeLabel; elIncomeLabel.removeAttribute('data-i18n'); }

            if (amountHidden) {
                if (elMainExpense) elMainExpense.innerText = '****';
                if (elTotalAssets) elTotalAssets.innerText = '****';
                if (elMonthlyIncome) elMonthlyIncome.innerText = '****';
            } else {
                if (elMainExpense) elMainExpense.innerText = periodExpense.toLocaleString('en-US', {minimumFractionDigits: 2});
                if (elTotalAssets) {
                    const netBalance = periodIncome - periodExpense;
                    elTotalAssets.innerText = (netBalance >= 0 ? '+' : '-') + Math.abs(netBalance).toLocaleString('en-US', {minimumFractionDigits: 2});
                }
                if (elMonthlyIncome) elMonthlyIncome.innerText = periodIncome.toLocaleString('en-US', {minimumFractionDigits: 2});
            }

            const netRow = document.getElementById('net-income-row');
            if (netRow) { if (periodIncome > 0) netRow.classList.remove('hidden'); else netRow.classList.add('hidden'); }

            if (elTrendBadge) { elTrendBadge.innerHTML = ''; }

            renderBudgetBars();
            renderHomeBudgetReminder();
            renderTransactionList();
            updateHomeFilters();
            applyI18n();
            // Also refresh charts if on stats page
            if(!document.getElementById('page-stats').classList.contains('hidden')) {
                renderCharts();
            }
            updateProStatus();
        }

        // --- Expense Calendar ---
        let calViewYear, calViewMonth, calMode = 'day';
        function openExpenseCalendar() {
            const now = new Date();
            calViewYear = now.getFullYear();
            calViewMonth = now.getMonth();
            calMode = 'day';
            renderCalPanel();
            document.getElementById('expense-cal-modal').classList.remove('hidden');
        }
        function closeExpenseCalendar() {
            document.getElementById('expense-cal-modal').classList.add('hidden');
        }
        function calPrev() { if (calMode === 'day') { calViewMonth--; if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; } } else if (calMode === 'month') { calViewYear--; } else { calViewYear -= 9; } renderCalPanel(); }
        function calNext() { const now = new Date(); if (calMode === 'day') { if (calViewYear === now.getFullYear() && calViewMonth === now.getMonth()) return; calViewMonth++; if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; } } else if (calMode === 'month') { if (calViewYear >= now.getFullYear()) return; calViewYear++; } else { if (calViewYear >= now.getFullYear()) return; calViewYear += 9; if (calViewYear > now.getFullYear()) calViewYear = now.getFullYear(); } renderCalPanel(); }
        function setCalMode(m) { calMode = m; renderCalPanel(); }
        let calPickerYear;
        function toggleCalYmPicker() {
            const el = document.getElementById('cal-ym-picker');
            if (el) { el.classList.toggle('hidden'); calPickerYear = calViewYear; }
        }
        function calPickerYearPrev() {
            calPickerYear--;
            document.getElementById('cal-picker-year').textContent = calPickerYear;
            updateCalPickerMonths();
        }
        function calPickerYearNext() {
            const now = new Date();
            if (calPickerYear >= now.getFullYear()) return;
            calPickerYear++;
            document.getElementById('cal-picker-year').textContent = calPickerYear;
            updateCalPickerMonths();
        }
        function updateCalPickerMonths() {
            const now = new Date();
            const grid = document.querySelector('#cal-ym-picker .grid');
            if (!grid) return;
            const btns = grid.querySelectorAll('button');
            btns.forEach((btn, i) => {
                const disabled = calPickerYear === now.getFullYear() && i > now.getMonth();
                const isCur = i === calViewMonth && calPickerYear === calViewYear;
                btn.disabled = disabled;
                btn.className = `py-2 rounded-[10px] text-[13px] font-medium transition-all ${disabled?'text-white/10 pointer-events-none':isCur?'bg-cyber-purple/20 text-cyber-purple':'text-white/60 active:bg-white/5'}`;
            });
        }
        function calPickMonth(m) {
            calViewYear = calPickerYear;
            calViewMonth = m;
            renderCalPanel();
        }
        function renderCalPanel() {
            const container = document.getElementById('expense-cal-content');
            const now = new Date();
            const year = calViewYear;
            const month = calViewMonth;
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
            const today = isCurrentMonth ? now.getDate() : -1;

            const dailyExpense = {};
            let monthTotal = 0;
            let activeDays = 0;
            let maxDay = 0;
            txs.filter(tx => {
                const d = new Date(tx.date);
                return d.getFullYear() === year && d.getMonth() === month && tx.type === 'expense';
            }).forEach(tx => {
                const day = new Date(tx.date).getDate();
                dailyExpense[day] = (dailyExpense[day] || 0) + tx.amount;
                monthTotal += tx.amount;
            });
            Object.keys(dailyExpense).forEach(k => { activeDays++; if (dailyExpense[k] > maxDay) maxDay = dailyExpense[k]; });

            const weekLabels = currentLang === 'zh' ? ['日','一','二','三','四','五','六'] :
                               currentLang === 'ja' ? ['日','月','火','水','木','金','土'] :
                               currentLang === 'ko' ? ['일','월','화','수','목','금','토'] :
                               ['S','M','T','W','T','F','S'];

            const monthLabel = currentLang === 'zh' ? `${year}年${month+1}月` :
                               currentLang === 'ja' ? `${year}年${month+1}月` :
                               currentLang === 'ko' ? `${year}년 ${month+1}월` :
                               `${new Date(year, month).toLocaleString('en',{month:'long'})} ${year}`;

            const avgDaily = activeDays > 0 ? (monthTotal / activeDays) : 0;
            const isAtEnd = isCurrentMonth;

            let html = '';

            // Close button + mode tabs
            const dayLabel = currentLang==='zh'?'日':currentLang==='ja'?'日':currentLang==='ko'?'일':'Day';
            const monLabel = currentLang==='zh'?'月':currentLang==='ja'?'月':currentLang==='ko'?'월':'Mon';
            const yearLabel = currentLang==='zh'?'年':currentLang==='ja'?'年':currentLang==='ko'?'년':'Year';
            html += `<div class="flex items-center justify-between mb-5">
                <div class="flex items-center gap-1 bg-white/[0.04] rounded-full p-0.5">
                    <button onclick="setCalMode('day')" class="px-3 py-1 rounded-full text-[12px] font-medium transition-all ${calMode==='day'?'bg-white/10 text-white':'text-white/40'}">${dayLabel}</button>
                    <button onclick="setCalMode('month')" class="px-3 py-1 rounded-full text-[12px] font-medium transition-all ${calMode==='month'?'bg-white/10 text-white':'text-white/40'}">${monLabel}</button>
                    <button onclick="setCalMode('year')" class="px-3 py-1 rounded-full text-[12px] font-medium transition-all ${calMode==='year'?'bg-white/10 text-white':'text-white/40'}">${yearLabel}</button>
                </div>
                <button onclick="closeExpenseCalendar()" class="w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.04] active:bg-white/[0.08] transition-colors"><i data-lucide="x" class="w-4 h-4 text-white/40"></i></button>
            </div>`;

            // Nav header
            const navLabel = calMode === 'day' ? monthLabel : calMode === 'month' ? String(year) : `${year-8} - ${year}`;
            html += `<div class="flex items-center justify-between mb-6">
                <button onclick="calPrev()" class="w-9 h-9 rounded-full flex items-center justify-center bg-white/[0.04] active:bg-white/10 transition-all active:scale-90">
                    <i data-lucide="chevron-left" class="w-4 h-4 text-white/50"></i>
                </button>
                ${calMode==='day' ? `<button onclick="toggleCalYmPicker()" class="flex items-center gap-1.5 px-3 py-1.5 rounded-full active:bg-white/5 transition-all">
                    <h3 class="text-[17px] font-semibold text-white tracking-tight">${navLabel}</h3>
                    <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-white/40"></i>
                </button>` : `<h3 class="text-[17px] font-semibold text-white tracking-tight">${navLabel}</h3>`}
                <button onclick="calNext()" class="w-9 h-9 rounded-full flex items-center justify-center ${isAtEnd ? 'opacity-20 pointer-events-none' : ''} bg-white/[0.04] active:bg-white/10 transition-all active:scale-90">
                    <i data-lucide="chevron-right" class="w-4 h-4 text-white/50"></i>
                </button>
            </div>`;

            // Year-Month picker (hidden by default)
            const pickerYears = [];
            for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) pickerYears.push(y);
            html += `<div id="cal-ym-picker" class="hidden mb-5 rounded-[16px] p-4" style="background:rgba(255,255,255,0.03)">
                <div class="flex items-center justify-center gap-2 mb-3">
                    <button onclick="calPickerYearPrev()" class="w-7 h-7 rounded-full flex items-center justify-center bg-white/[0.04] active:bg-white/10"><i data-lucide="chevron-left" class="w-3.5 h-3.5 text-white/40"></i></button>
                    <span id="cal-picker-year" class="text-[15px] font-semibold text-white w-14 text-center font-num">${year}</span>
                    <button onclick="calPickerYearNext()" class="w-7 h-7 rounded-full flex items-center justify-center bg-white/[0.04] active:bg-white/10"><i data-lucide="chevron-right" class="w-3.5 h-3.5 text-white/40"></i></button>
                </div>
                <div class="grid grid-cols-4 gap-2">${Array.from({length:12},(_, i) => {
                    const mLabel = currentLang === 'en' ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i] : (i+1)+'月';
                    const isCur = i === month && year === calViewYear;
                    const disabled = year === now.getFullYear() && i > now.getMonth();
                    return `<button onclick="calPickMonth(${i})" ${disabled?'disabled':''} class="py-2 rounded-[10px] text-[13px] font-medium transition-all ${disabled?'text-white/10 pointer-events-none':isCur?'bg-cyber-purple/20 text-cyber-purple':'text-white/60 active:bg-white/5'}">${mLabel}</button>`;
                }).join('')}</div>
            </div>`;

            if (calMode === 'day') {
            // Summary stats row
            html += `<div class="flex gap-2.5 mb-6">
                <div class="flex-1 p-3.5">
                    <p class="text-[20px] font-semibold text-white font-num">${monthTotal.toLocaleString()}</p>
                    <p class="text-[11px] text-white/30 mt-1">${t('expense')}</p>
                </div>
                <div class="flex-1 p-3.5">
                    <p class="text-[20px] font-semibold text-white font-num">${activeDays}</p>
                    <p class="text-[11px] text-white/30 mt-1">${currentLang==='zh'?'记账天数':currentLang==='ja'?'記録日数':currentLang==='ko'?'기록 일수':'Days'}</p>
                </div>
                <div class="flex-1 p-3.5">
                    <p class="text-[20px] font-semibold text-white font-num">${avgDaily >= 1000 ? (avgDaily/1000).toFixed(1)+'k' : avgDaily.toFixed(0)}</p>
                    <p class="text-[11px] text-white/30 mt-1">${currentLang==='zh'?'日均':currentLang==='ja'?'日平均':currentLang==='ko'?'일평균':'Daily'}</p>
                </div>
            </div>`;

            // Calendar grid
            html += `<div class="rounded-[20px] p-4" style="background:rgba(255,255,255,0.02)">`;
            html += `<div class="grid grid-cols-7 mb-2">`;
            weekLabels.forEach(w => {
                html += `<div class="text-[11px] text-white/25 text-center py-1.5 font-medium">${w}</div>`;
            });
            html += `</div>`;

            html += `<div class="grid grid-cols-7 gap-y-1.5">`;
            for (let i = 0; i < firstDay; i++) {
                html += `<div></div>`;
            }

            for (let d = 1; d <= daysInMonth; d++) {
                const amt = dailyExpense[d];
                const isToday = d === today;
                const hasData = amt > 0;
                const intensity = hasData ? Math.min(0.35, 0.1 + (amt / maxDay) * 0.25) : 0;
                const bgStyle = hasData ? `background:rgba(124,58,237,${intensity})` : '';
                const todayStyle = isToday ? 'box-shadow:0 0 0 1.5px rgba(124,58,237,0.6),0 0 8px rgba(124,58,237,0.2)' : '';
                const amtStr = amt >= 10000 ? (amt/10000).toFixed(1)+'w' : amt >= 1000 ? (amt/1000).toFixed(1)+'k' : amt ? amt.toFixed(0) : '';

                html += `<div class="flex flex-col items-center">
                    <div class="w-[42px] h-[46px] rounded-[12px] flex flex-col items-center justify-center transition-all" style="${bgStyle};${todayStyle}">
                        <span class="text-[14px] ${isToday ? 'text-cyber-purple font-semibold' : hasData ? 'text-white/80' : 'text-white/30'} font-num leading-tight">${d}</span>
                        ${hasData ? `<span class="text-[12px] ${isToday ? 'text-cyber-purple' : 'text-white/45'} font-num leading-tight mt-0.5">${amtStr}</span>` : ''}
                    </div>
                </div>`;
            }

            html += `</div></div>`;

            } else if (calMode === 'month') {
            // Month view — 12 months grid for a year
            const monthlyData = Array.from({length: 12}, () => ({total: 0, days: 0}));
            let yearTotal = 0;
            txs.filter(tx => {
                const d = new Date(tx.date);
                return d.getFullYear() === year && tx.type === 'expense';
            }).forEach(tx => {
                const d = new Date(tx.date);
                const m = d.getMonth();
                monthlyData[m].total += tx.amount;
                yearTotal += tx.amount;
                if (!monthlyData[m]['_d']) monthlyData[m]['_d'] = new Set();
                monthlyData[m]['_d'].add(d.getDate());
            });
            monthlyData.forEach(md => { md.days = md['_d'] ? md['_d'].size : 0; });
            const maxMonth = Math.max(...monthlyData.map(m => m.total), 1);

            const yearActiveDays = monthlyData.reduce((s, m) => s + m.days, 0);
            const yearAvg = yearTotal > 0 ? yearTotal / 12 : 0;
            html += `<div class="flex gap-2.5 mb-6">
                <div class="flex-1 p-3.5">
                    <p class="text-[20px] font-semibold text-white font-num">${yearTotal.toLocaleString()}</p>
                    <p class="text-[11px] text-white/30 mt-1">${currentLang==='zh'?'年度支出':currentLang==='ja'?'年間支出':currentLang==='ko'?'연간 지출':'Annual'}</p>
                </div>
                <div class="flex-1 p-3.5">
                    <p class="text-[20px] font-semibold text-white font-num">${yearActiveDays}</p>
                    <p class="text-[11px] text-white/30 mt-1">${currentLang==='zh'?'记账天数':currentLang==='ja'?'記録日数':currentLang==='ko'?'기록 일수':'Days'}</p>
                </div>
                <div class="flex-1 p-3.5">
                    <p class="text-[20px] font-semibold text-white font-num">${yearAvg >= 10000 ? (yearAvg/10000).toFixed(1)+'w' : yearAvg >= 1000 ? (yearAvg/1000).toFixed(1)+'k' : yearAvg.toFixed(0)}</p>
                    <p class="text-[11px] text-white/30 mt-1">${currentLang==='zh'?'月均':currentLang==='ja'?'月平均':currentLang==='ko'?'월평균':'Monthly'}</p>
                </div>
            </div>`;

            const mNames = currentLang === 'en' ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] :
                           currentLang === 'ko' ? ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'] :
                           ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
            html += `<div class="grid grid-cols-3 gap-2.5">`;
            for (let m = 0; m < 12; m++) {
                const md = monthlyData[m];
                const isFuture = year === now.getFullYear() && m > now.getMonth();
                const intensity = md.total > 0 ? Math.min(0.3, 0.08 + (md.total / maxMonth) * 0.22) : 0;
                const bgStyle = md.total > 0 ? `background:rgba(124,58,237,${intensity})` : '';
                const amtStr = md.total >= 10000 ? (md.total/10000).toFixed(1)+'w' : md.total >= 1000 ? (md.total/1000).toFixed(1)+'k' : md.total > 0 ? md.total.toFixed(0) : '-';
                html += `<div class="rounded-[14px] p-3 ${isFuture ? 'opacity-20' : ''}" style="${bgStyle || 'background:rgba(255,255,255,0.02)'}">
                    <p class="text-[12px] text-white/40 mb-1">${mNames[m]}</p>
                    <p class="text-[16px] font-semibold text-white font-num">${amtStr}</p>
                </div>`;
            }
            html += `</div>`;

            } else {
            // Year view — 6 years in 3x2 grid
            const yearsToShow = [year - 8, year - 7, year - 6, year - 5, year - 4, year - 3, year - 2, year - 1, year];
            const yearlyData = yearsToShow.map(y => {
                let total = 0;
                txs.filter(tx => new Date(tx.date).getFullYear() === y && tx.type === 'expense').forEach(tx => { total += tx.amount; });
                return { year: y, total };
            });

            html += `<div class="grid grid-cols-3 gap-2.5">`;
            yearlyData.forEach(yd => {
                const isCurrent = yd.year === now.getFullYear();
                const amtStr = yd.total >= 10000 ? (yd.total/10000).toFixed(1)+'w' : yd.total >= 1000 ? (yd.total/1000).toFixed(1)+'k' : yd.total > 0 ? yd.total.toFixed(0) : '-';
                html += `<div class="rounded-[14px] p-3.5 text-center" style="background:rgba(255,255,255,0.03)">
                    <p class="text-[15px] ${isCurrent ? 'text-cyber-purple font-semibold' : 'text-white/70'} font-num">${yd.year}</p>
                    <p class="text-[20px] font-semibold text-white font-num mt-1">${amtStr}</p>
                </div>`;
            });
            html += `</div>`;
            }

            container.innerHTML = html;
            lucide.createIcons();
        }

        function loadMoreTx() {
            listRenderCount += 50;
            renderTransactionList();
        }

        function renderTransactionList() {
            const list = document.getElementById('transaction-list');
            list.innerHTML = '';
            document.getElementById('history-scope').textContent = showAllHistory ? '全部历史记录（当前账本）' : '已按日期筛选 · 点击上方查看全部';

            const filtered = txs.filter(t => {
                const txDate = new Date(t.date);

                // 1. Date Filter (use local date to avoid timezone issues)
                let dateMatch = true;
                if (dateFilterState.mode === 'month') {
                    const txMonth = `${txDate.getFullYear()}-${String(txDate.getMonth()+1).padStart(2,'0')}`;
                    dateMatch = txMonth === dateFilterState.value;
                } else if (dateFilterState.mode === 'year') {
                    dateMatch = txDate.getFullYear().toString() === dateFilterState.value.toString();
                } else if (dateFilterState.mode === 'day') {
                    const txDay = `${txDate.getFullYear()}-${String(txDate.getMonth()+1).padStart(2,'0')}-${String(txDate.getDate()).padStart(2,'0')}`;
                    dateMatch = txDay === dateFilterState.value;
                } else if (dateFilterState.mode === 'range') {
                    if (dateFilterState.start && dateFilterState.end) {
                        const s = new Date(dateFilterState.start); s.setHours(0,0,0,0);
                        const e = new Date(dateFilterState.end); e.setHours(23,59,59,999);
                        dateMatch = txDate >= s && txDate <= e;
                    }
                }

                if (!showAllHistory && !dateMatch) return false;

                // 2. Type Filter
                if (listFilterType !== 'all' && t.type !== listFilterType) return false;

                // 3. Cat Filter
                if (listFilterCat !== 'all' && !listFilterCat.includes(t.cat)) return false;

                return true;
            });
            
            if (filtered.length === 0) {
                 list.innerHTML = `<div class="flex flex-col items-center justify-center py-20">
                    <div class="w-16 h-16 rounded-full flex items-center justify-center" style="background:linear-gradient(135deg,rgba(124,58,237,0.08),rgba(99,102,241,0.04))">
                        <i data-lucide="inbox" class="w-7 h-7 text-white/15"></i>
                    </div>
                    <p class="text-white/30 text-[14px]">${t('no_records')}</p>
                    <p class="text-white/15 text-[12px] mt-1">${t('no_records_hint')}</p>
                 </div>`;
                 lucide.createIcons({attrs: {class: ''}, nameAttr: 'data-lucide'});
                 return;
            }

            filtered.sort((a,b)=>new Date(b.date)-new Date(a.date));

            const today = new Date();
            const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
            const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate()-1);
            const yesterdayStr = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;

            // Pre-compute day totals in O(n)
            const dayTotals = {};
            filtered.forEach(tx => {
                const d = new Date(tx.date);
                const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                if (!dayTotals[k]) dayTotals[k] = 0;
                dayTotals[k] += tx.type === 'expense' ? -tx.amount : tx.amount;
            });

            const PAGE_SIZE = 50;
            const visibleItems = filtered.slice(0, listRenderCount);
            let lastGroupKey = '';

            visibleItems.forEach(tx => {
                const dateObj = new Date(tx.date);
                const groupKey = `${dateObj.getFullYear()}-${dateObj.getMonth()}-${dateObj.getDate()}`;

                if (groupKey !== lastGroupKey) {
                    lastGroupKey = groupKey;
                    let groupLabel = '';
                    if (groupKey === todayStr) groupLabel = t('today') || '今天';
                    else if (groupKey === yesterdayStr) groupLabel = t('yesterday') || '昨天';
                    else groupLabel = currentLang === 'zh' ? `${dateObj.getMonth()+1}月${dateObj.getDate()}日` : `${dateObj.getMonth()+1}/${dateObj.getDate()}`;

                    const dayNet = dayTotals[groupKey] || 0;
                    const dayStr = (dayNet >= 0 ? '+' : '-') + Math.abs(dayNet).toLocaleString();

                    const header = document.createElement('div');
                    header.className = 'flex items-center justify-between px-1 pt-4 pb-2';
                    header.innerHTML = `<span class="text-xs font-normal text-white/60">${groupLabel}</span><span class="text-[11px] font-num text-white/35">${dayStr}</span>`;
                    list.appendChild(header);
                }

                const isInc = tx.type === 'income';
                const catObj = isInc ? INCOME_CATS : EXPENSE_CATS;
                const c = catObj[tx.cat] || { label:'?', color:'#666', icon:'help-circle' };
                const catName = t('cat_' + tx.cat) || c.label;

                const amountClass = isInc ? 'text-teal-neon' : 'text-white';
                const shadowColor = isInc ? 'rgba(0, 242, 234, 0.15)' : 'rgba(255, 255, 255, 0.05)';

                const wrapper = document.createElement('div');
                wrapper.className = 'tx-swipe-wrapper';

                wrapper.innerHTML = `
                    <div class="tx-swipe-actions">
                        <button class="tx-edit-btn w-14 h-full flex flex-col items-center justify-center bg-cyber-purple/80 rounded-xl text-white gap-0.5">
                            <i data-lucide="pencil" class="w-4 h-4"></i>
                            <span class="text-[9px]">${t('manage')}</span>
                        </button>
                        <button class="tx-delete-btn w-14 h-full flex flex-col items-center justify-center bg-red-500/80 rounded-xl text-white gap-0.5">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                            <span class="text-[9px]">${t('delete')}</span>
                        </button>
                    </div>
                    <div class="tx-swipe-content group rounded-[12px] px-4 h-[56px] flex items-center cursor-pointer">
                        <div class="flex items-center justify-between w-full">
                            <div class="flex items-center gap-3">
                                <i data-lucide="${c.icon||'tag'}" class="w-[18px] h-[18px] shrink-0"
                                   style="color: ${c.color}; opacity: 0.85;"></i>
                                <div class="flex flex-col gap-0.5">
                                    <span class="text-[15px] font-medium text-white/90 tracking-wide">${tx.desc}</span>
                                    <span class="text-[12px] text-white/60 font-normal">${catName}</span>
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="block text-[17px] font-normal font-num ${amountClass} tracking-tight"
                                      style="text-shadow: 0 0 20px ${shadowColor}">
                                    ${isInc?'+':'-'}${tx.amount.toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </div>
                `;
                const txId = String(tx.id);
                wrapper.querySelector('.tx-swipe-content').addEventListener('click', () => {
                    if (!wrapper._swiping && !wrapper.classList.contains('swiped')) openEdit(txId);
                });
                wrapper.querySelector('.tx-edit-btn').addEventListener('click', () => openEdit(txId));
                wrapper.querySelector('.tx-delete-btn').addEventListener('click', () => deleteTx(txId));
                initSwipe(wrapper);
                list.appendChild(wrapper);
            });

            if (filtered.length > listRenderCount) {
                const remaining = filtered.length - listRenderCount;
                const loadMore = document.createElement('div');
                loadMore.className = 'flex justify-center py-6';
                loadMore.innerHTML = `<button onclick="loadMoreTx()" class="px-5 py-2 rounded-full text-[13px] text-white/50 bg-white/5 active:bg-white/10 transition-all">${t('load_more') || '加载更多'} (${remaining})</button>`;
                list.appendChild(loadMore);
            }

            lucide.createIcons();
        }

        function setChartType(type) {
            chartDisplayType = type;
            const expTab = document.getElementById('chart-tab-expense');
            const incTab = document.getElementById('chart-tab-income');
            if (type === 'expense') {
                expTab.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyber-purple/20 transition-all';
                expTab.querySelector('span:last-child').className = 'text-[10px] text-white font-medium';
                incTab.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all';
                incTab.querySelector('span:last-child').className = 'text-[10px] text-white/35 font-medium';
            } else {
                incTab.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 transition-all';
                incTab.querySelector('span:last-child').className = 'text-[10px] text-white font-medium';
                expTab.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all';
                expTab.querySelector('span:last-child').className = 'text-[10px] text-white/35 font-medium';
            }
            renderCharts();
        }

        function setPieType(type) {
            currentPieType = type;
            const expTab = document.getElementById('pie-tab-expense');
            const incTab = document.getElementById('pie-tab-income');
            if (type === 'expense') {
                expTab.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyber-purple/20 transition-all';
                expTab.querySelector('span:last-child').className = 'text-[10px] text-white font-medium';
                incTab.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all';
                incTab.querySelector('span:last-child').className = 'text-[10px] text-white/35 font-medium';
            } else {
                incTab.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 transition-all';
                incTab.querySelector('span:last-child').className = 'text-[10px] text-white font-medium';
                expTab.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all';
                expTab.querySelector('span:last-child').className = 'text-[10px] text-white/35 font-medium';
            }
            renderCharts();
        }

        function setStatsFilter(f) {
            if (f === 'custom') {
                openStatsDatePicker();
                return;
            }
            currentStatsFilter = f;
            document.querySelectorAll('.filter-pill').forEach(b => {
                b.id === `filter-${f}` ? b.classList.add('active') : b.classList.remove('active');
            });
            renderCharts();
        }

        function openStatsDatePicker() {
            document.getElementById('date-filter-modal').classList.remove('hidden');
            initDatePicker();
            document.getElementById('date-filter-modal').dataset.statsMode = 'true';
            setDateFilterMode('month');
        }


        function openCategoryManager() {
            document.getElementById('category-modal').classList.remove('hidden');
            closeCatIconPicker();
            setManageType(currentManageType);
        }
        function closeCategoryManager() {
            document.getElementById('category-modal').classList.add('hidden');
            const currentTxType = document.getElementById('btn-expense').classList.contains('text-white') ? 'expense' : 'income';
            populateCats(currentTxType === 'expense' ? EXPENSE_CATS : INCOME_CATS);
            listFilterCat = 'all';
            document.getElementById('label-cat').innerText = t('all_cats');
        }

        function setManageType(type) {
            currentManageType = type;
            const bg = document.getElementById('manage-type-bg');
            const btnExp = document.getElementById('manage-btn-expense');
            const btnInc = document.getElementById('manage-btn-income');
            
            if (type === 'expense') {
                bg.style.left = '4px';
                btnExp.className = 'flex-1 relative z-10 text-[14px] font-normal text-white transition-colors';
                btnInc.className = 'flex-1 relative z-10 text-[14px] font-normal text-white/35 transition-colors';
            } else {
                bg.style.left = 'calc(50%)';
                btnExp.className = 'flex-1 relative z-10 text-[14px] font-normal text-white/35 transition-colors';
                btnInc.className = 'flex-1 relative z-10 text-[14px] font-normal text-white transition-colors';
            }
            renderCategoryList();
            selectedCatIcon = 'tag';
            closeCatIconPicker();
            const preview = document.getElementById('cat-icon-preview');
            if (preview) { preview.setAttribute('data-lucide', 'tag'); lucide.createIcons(); }
        }

        let editingCatKey = null;
        let editingCatIcon = null;

        function renderCategoryList() {
            const list = document.getElementById('category-list');
            const cats = currentManageType === 'expense' ? EXPENSE_CATS : INCOME_CATS;
            const keys = Object.keys(cats);
            const sysKeys = currentManageType === 'expense' ? SYSTEM_EXPENSE_KEYS : SYSTEM_INCOME_KEYS;

            document.getElementById('cat-limit-info').innerText = `${keys.length}/15`;

            const sysHtml = keys.filter(k => sysKeys.includes(k)).map(key => {
                const c = cats[key];
                return `<div class="flex flex-col items-center gap-2">
                    <div class="w-12 h-12 rounded-full flex items-center justify-center bg-white/5" style="color:${c.color}">
                        <i data-lucide="${c.icon||'tag'}" class="w-6 h-6"></i>
                    </div>
                    <span class="text-[11px] text-white/50 truncate max-w-full">${t('cat_'+key)||c.label}</span>
                </div>`;
            }).join('');

            const customKeys = keys.filter(k => !sysKeys.includes(k));
            const customHtml = customKeys.map(key => {
                const c = cats[key];
                return `<div onclick="openEditCategory('${key}')" class="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/[0.03] active:bg-white/10 transition-colors cursor-pointer">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 shrink-0" style="color:${c.color}">
                        <i data-lucide="${c.icon||'tag'}" class="w-5 h-5"></i>
                    </div>
                    <span class="flex-1 text-[14px] text-white truncate">${c.label}</span>
                    <i data-lucide="chevron-right" class="w-4 h-4 text-white/20 shrink-0"></i>
                </div>`;
            }).join('');

            list.innerHTML = `
                <div class="grid grid-cols-4 gap-x-2 gap-y-3 py-2 mb-3">${sysHtml}</div>
                ${customKeys.length ? `<div class="text-[10px] text-white/30 uppercase tracking-wider mb-2 mt-1">自定义</div>
                <div class="flex flex-col gap-2 pb-2">${customHtml}</div>` : ''}`;
            lucide.createIcons();
        }

        function openEditCategory(key) {
            editingCatKey = key;
            const cats = currentManageType === 'expense' ? EXPENSE_CATS : INCOME_CATS;
            const c = cats[key];
            if (!c) return;
            editingCatIcon = c.icon || 'tag';
            const panel = document.getElementById('icon-picker-panel');
            panel.innerHTML = `
                <div class="p-6 pb-2">
                    <div class="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5"></div>
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-lg font-semibold text-white tracking-tight">${t('edit_cat')}</h3>
                        <button onclick="closeEditCategory()" class="flex items-center justify-center"><i data-lucide="x" class="w-5 h-5 text-gray-600"></i></button>
                    </div>
                    <div class="flex flex-col items-center gap-4 mb-6">
                        <div onclick="showEditIconGrid()" class="w-16 h-16 rounded-full flex items-center justify-center bg-white/5 border-2 border-dashed border-white/20 active:border-cyber-purple/50 transition-colors cursor-pointer" style="color:${c.color}" id="edit-cat-icon-wrap">
                            <i data-lucide="${editingCatIcon}" class="w-7 h-7" id="edit-cat-icon-preview"></i>
                        </div>
                        <span class="text-[11px] text-white/30">${t('tap_change_icon')}</span>
                    </div>
                    <div class="mb-6">
                        <input type="text" id="edit-cat-name" value="${c.label}" maxlength="6" class="w-full bg-white/5 border-0 rounded-[12px] px-4 py-3 text-white text-center text-[16px] focus:outline-none focus:ring-0 transition-colors">
                    </div>
                    <div id="edit-icon-grid" class="hidden max-h-[30vh] overflow-y-auto no-scrollbar mb-4">
                        <div class="grid grid-cols-6 gap-3"></div>
                    </div>
                </div>
                <div class="mt-auto p-6 pt-0 flex gap-3">
                    <button onclick="deleteEditCategory()" class="flex-1 h-12 rounded-full border border-[#7c3aed] text-[#a855f7] text-[14px] font-medium active:scale-95 transition-all">${t('delete')}</button>
                    <button onclick="saveEditCategory()" class="flex-1 h-12 rounded-full bg-gradient-to-r from-[#7c3aed] to-[#a855f7] text-white text-[14px] font-medium active:scale-95 transition-all shadow-[0_8px_24px_-4px_rgba(124,58,237,0.4)]">${t('save')}</button>
                </div>`;
            panel.classList.remove('hidden');
            lucide.createIcons();
        }

        function showEditIconGrid() {
            const grid = document.getElementById('edit-icon-grid');
            if (grid.classList.contains('hidden')) {
                grid.classList.remove('hidden');
                grid.querySelector('.grid').innerHTML = CAT_ICONS.map(icon => `
                    <div onclick="pickEditIcon('${icon}')" class="flex items-center justify-center w-11 h-11 rounded-xl cursor-pointer transition-all ${icon === editingCatIcon ? 'bg-[#7c3aed] scale-110' : 'bg-white/5 active:bg-white/10'}">
                        <i data-lucide="${icon}" class="w-5 h-5 ${icon === editingCatIcon ? 'text-white' : 'text-white/50'}"></i>
                    </div>`).join('');
                lucide.createIcons();
            } else {
                grid.classList.add('hidden');
            }
        }

        function pickEditIcon(icon) {
            editingCatIcon = icon;
            const preview = document.getElementById('edit-cat-icon-preview');
            if (preview) { preview.setAttribute('data-lucide', icon); lucide.createIcons(); }
            document.getElementById('edit-icon-grid').querySelector('.grid').innerHTML = CAT_ICONS.map(ic => `
                <div onclick="pickEditIcon('${ic}')" class="flex items-center justify-center w-11 h-11 rounded-xl cursor-pointer transition-all ${ic === icon ? 'bg-[#7c3aed] scale-110' : 'bg-white/5 active:bg-white/10'}">
                    <i data-lucide="${ic}" class="w-5 h-5 ${ic === icon ? 'text-white' : 'text-white/50'}"></i>
                </div>`).join('');
            lucide.createIcons();
        }

        function saveEditCategory() {
            if (!editingCatKey) return;
            const cats = currentManageType === 'expense' ? EXPENSE_CATS : INCOME_CATS;
            const name = document.getElementById('edit-cat-name').value.trim();
            if (!name) { showToast('请输入分类名称', 'error'); return; }
            cats[editingCatKey].label = name;
            cats[editingCatKey].icon = editingCatIcon;
            saveCustomCats();
            closeEditCategory();
            renderCategoryList();
            showToast(`已保存「${name}」`);
        }

        function deleteEditCategory() {
            if (!editingCatKey) return;
            const cats = currentManageType === 'expense' ? EXPENSE_CATS : INCOME_CATS;
            const label = cats[editingCatKey]?.label || '';
            const fallback = currentManageType === 'expense' ? 'other' : 'other_in';
            txs.forEach(tx => { if (tx.cat === editingCatKey) tx.cat = fallback; });
            saveTxs();
            delete cats[editingCatKey];
            saveCustomCats();
            closeEditCategory();
            renderCategoryList();
            renderAll();
            showToast(`${t('removed_cat')}「${label}」`);
        }

        function closeEditCategory() {
            editingCatKey = null;
            editingCatIcon = null;
            document.getElementById('icon-picker-panel').classList.add('hidden');
        }

        function saveCustomCats() {
            const customExp = {};
            const customInc = {};
            for (let k in EXPENSE_CATS) { if (!(k in DEFAULT_EXPENSE_CATS)) customExp[k] = EXPENSE_CATS[k]; }
            for (let k in INCOME_CATS) { if (!(k in DEFAULT_INCOME_CATS)) customInc[k] = INCOME_CATS[k]; }
            nfStorage.setItem('custom_expense_cats', JSON.stringify(customExp));
            nfStorage.setItem('custom_income_cats', JSON.stringify(customInc));
        }

                const CAT_ICONS = ['tag','coffee','car','shopping-bag','cpu','home','gamepad-2','package','heart','dog','cat','baby','shirt','scissors','book','music','film','camera','pen-tool','palette','dumbbell','bike','plane','train','bus','fuel','pill','stethoscope','graduation-cap','briefcase','building','store','gift','banknote','wallet','trending-up','sparkles','leaf','flower-2','paw-print','bone','fish','egg','apple','pizza','beer','wine','cigarette','umbrella','glasses','watch','gem','crown','star','moon','sun','cloud','zap'];
        let selectedCatIcon = 'tag';

        function toggleCatIconPicker() {
            const panel = document.getElementById('icon-picker-panel');
            if (!panel) return;
            panel.innerHTML = `
                <div class="p-6 pb-2">
                    <div class="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5"></div>
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold text-white tracking-tight">选择图标</h3>
                        <button onclick="closeCatIconPicker()" class="flex items-center justify-center"><i data-lucide="x" class="w-5 h-5 text-gray-600"></i></button>
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto px-6 pb-10 no-scrollbar">
                    <div id="icon-picker" class="grid grid-cols-5 gap-4"></div>
                </div>`;
            panel.classList.remove('hidden');
            renderIconPicker();
        }

        function closeCatIconPicker() {
            const panel = document.getElementById('icon-picker-panel');
            if (panel) panel.classList.add('hidden');
        }

        function renderIconPicker() {
            const grid = document.getElementById('icon-picker');
            if (!grid) return;
            grid.innerHTML = CAT_ICONS.map(icon => `
                <div onclick="selectCatIcon('${icon}')" class="flex items-center justify-center w-12 h-12 rounded-2xl cursor-pointer transition-colors ${icon === selectedCatIcon ? 'bg-[#7c3aed]' : 'bg-white/5'}" data-icon-key="${icon}">
                    <i data-lucide="${icon}" class="w-6 h-6 ${icon === selectedCatIcon ? 'text-white' : 'text-white/50'}"></i>
                </div>
            `).join('');
            lucide.createIcons();
        }

        function selectCatIcon(icon) {
            selectedCatIcon = icon;
            const preview = document.getElementById('cat-icon-preview');
            if (preview) { preview.setAttribute('data-lucide', icon); lucide.createIcons(); }
            closeCatIconPicker();
        }

        function addNewCategory() {
            const name = document.getElementById('new-cat-name').value.trim();
            if(!name) { showToast(t('enter_cat_name'), 'error'); return; }
            const cats = currentManageType === 'expense' ? EXPENSE_CATS : INCOME_CATS;
            if(Object.keys(cats).length >= 15) { showToast(t('max_cats'), 'error'); return; }
            const id = 'custom_' + Date.now();
            const randomColor = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
            cats[id] = { label: name, color: randomColor, icon: selectedCatIcon };
            saveCustomCats();
            document.getElementById('new-cat-name').value = '';
            selectedCatIcon = 'tag';
            closeCatIconPicker();
            const catPreview = document.getElementById('cat-icon-preview');
            if (catPreview) { catPreview.setAttribute('data-lucide', 'tag'); lucide.createIcons(); }
            renderCategoryList();
            showToast(`${t('added_cat')}「${name}」`);
        }

        function removeCategory(key) {
            const cats = currentManageType === 'expense' ? EXPENSE_CATS : INCOME_CATS;
            const label = cats[key]?.label || '';
            const fallback = currentManageType === 'expense' ? 'other' : 'other_in';
            txs.forEach(tx => { if (tx.cat === key) tx.cat = fallback; });
            saveTxs();
            delete cats[key];
            saveCustomCats();
            renderCategoryList();
            renderAll();
            showToast(`${t('removed_cat')}「${label}」`);
        }

        function insertOp(op) {
            const input = document.getElementById('e-amount');
            const pos = input.selectionStart || input.value.length;
            const val = input.value;
            input.value = val.slice(0, pos) + op + val.slice(pos);
            input.focus();
            input.setSelectionRange(pos + 1, pos + 1);
            previewCalc();
        }
        function evalAmount(expr) {
            if (!expr || !expr.trim()) return NaN;
            const clean = expr.replace(/\s/g,'').replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-').replace(/，/g,'.').replace(/。/g,'.');
            if (!/^[\d+\-*/.()]+$/.test(clean)) return NaN;
            if (/[+\-*/.]{2,}/.test(clean.replace(/\(-/g,'(0-'))) return NaN;
            try { const r = Function('"use strict";return(' + clean + ')')(); return typeof r === 'number' && isFinite(r) ? Math.round(r*100)/100 : NaN; } catch(e) { return NaN; }
        }
        function previewCalc() {
            const input = document.getElementById('e-amount').value;
            const preview = document.getElementById('calc-preview');
            if (/[+\-*/]/.test(input) && input.length > 1) {
                const result = evalAmount(input);
                if (!isNaN(result) && result > 0) { preview.textContent = '= ' + result; preview.style.opacity = '1'; }
                else { preview.style.opacity = '0'; }
            } else { preview.style.opacity = '0'; }
        }

        function openNewTx() {
            const now = new Date();
            const eTime = document.getElementById('e-time');
            eTime.value = new Date(now.getTime() - now.getTimezoneOffset()*60000).toISOString().slice(0,16);
            eTime.max = eTime.value;
            document.getElementById('modal-title').innerText = t('modal_add');
            document.getElementById('e-id').value = '';
            document.getElementById('e-amount').value = '';
            document.getElementById('e-desc').value = '';
            document.getElementById('btn-delete').classList.add('hidden');
            setType('expense');
            document.getElementById('edit-modal').classList.remove('hidden');
        }
        function closeEditModal() { document.getElementById('edit-modal').classList.add('hidden'); }
        
        function setType(type) {
            const bg = document.getElementById('type-bg');
            const btnExp = document.getElementById('btn-expense');
            const btnInc = document.getElementById('btn-income');
            if (type === 'expense') {
                bg.style.left = '4px';
                btnExp.className = 'flex-1 relative z-10 text-[14px] font-normal text-white transition-colors';
                btnInc.className = 'flex-1 relative z-10 text-[14px] font-normal text-white/35 transition-colors';
                populateCats(EXPENSE_CATS);
            } else {
                bg.style.left = 'calc(50%)';
                btnExp.className = 'flex-1 relative z-10 text-[14px] font-normal text-white/35 transition-colors';
                btnInc.className = 'flex-1 relative z-10 text-[14px] font-normal text-white transition-colors';
                populateCats(INCOME_CATS);
            }
        }
        
        function populateCats(cats) {
            const grid = document.getElementById('cat-grid');
            const eCat = document.getElementById('e-cat');
            const currentVal = (eCat.value && cats[eCat.value]) ? eCat.value : Object.keys(cats)[0];
            grid.innerHTML = Object.entries(cats).map(([k, v]) => `
                <div onclick="selectCatGrid('${k}')" class="flex flex-col items-center gap-2 py-2 cursor-pointer" data-cat-key="${k}">
                    <div class="w-12 h-12 rounded-full flex items-center justify-center transition-colors ${k === currentVal ? 'bg-[#7c3aed]' : 'bg-white/5'}" style="color:${k === currentVal ? '#fff' : v.color}">
                        <i data-lucide="${v.icon}" class="w-6 h-6"></i>
                    </div>
                    <span class="text-[14px] transition-colors ${k === currentVal ? 'text-white font-bold' : 'text-white/40'}">${t('cat_' + k) || v.label}</span>
                </div>
            `).join('');
            document.getElementById('e-cat').value = currentVal;
            lucide.createIcons({attrs: {class: ''}, nameAttr: 'data-lucide'});
        }
        function selectCatGrid(key) {
            document.getElementById('e-cat').value = key;
            const cats = document.getElementById('btn-expense').classList.contains('text-white') ? EXPENSE_CATS : INCOME_CATS;
            document.querySelectorAll('#cat-grid > div').forEach(el => {
                const k = el.dataset.catKey;
                const isActive = k === key;
                const c = cats[k];
                el.querySelector('div').className = `w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isActive ? 'bg-[#7c3aed]' : 'bg-white/5'}`;
                el.querySelector('div').style.color = isActive ? '#fff' : (c ? c.color : '');
                el.querySelector('span').className = `text-[14px] transition-colors ${isActive ? 'text-white font-bold' : 'text-white/40'}`;
            });
        }

        function saveTx(e) {
            e.preventDefault();
            const amountVal = evalAmount(document.getElementById('e-amount').value);
            if (!amountVal || isNaN(amountVal) || amountVal <= 0) { showToast(t('enter_amount'), 'error'); return; }
            const txDate = new Date(document.getElementById('e-time').value);
            if (txDate > new Date()) { showToast(t('no_future_date') || '不能选择未来日期', 'error'); return; }
            const descVal = document.getElementById('e-desc').value.trim();
            const idVal = document.getElementById('e-id').value;
            const originalTx = idVal ? txs.find(x => String(x.id) === idVal) : null;
            if (idVal && !originalTx) { showToast('未找到原账单，请重新打开后重试', 'error'); return; }
            const id = originalTx ? originalTx.id : Date.now() + Math.floor(Math.random() * 10000);
            const type = document.getElementById('btn-expense').classList.contains('text-white') ? 'expense' : 'income';
            const isEdit = !!idVal;
            const newTx = {
                id: id,
                amount: amountVal,
                desc: descVal,
                cat: document.getElementById('e-cat').value,
                date: new Date(document.getElementById('e-time').value).toISOString(),
                type: type
            };
            const idx = txs.findIndex(x => x.id === id);
            if(idx > -1) txs[idx] = newTx; else txs.push(newTx);
            renderAll();
            closeEditModal();
            showToast(isEdit ? t('toast_updated') : `${t('toast_recorded')} ${amountVal.toLocaleString()}`);
        }

        function deleteTxFromModal() {
            const id = document.getElementById('e-id').value;
            const tx = txs.find(x => String(x.id) === id);
            if (tx) pushUndo('delete', {...tx});
            txs = txs.filter(x => String(x.id) !== String(id));
            renderAll();
            closeEditModal();
            showToast(t('toast_deleted'));
        }

        function openEdit(id) {
            const tx = txs.find(x => String(x.id) === String(id));
            if(!tx) return;
            document.getElementById('modal-title').innerText = t('modal_edit');
            document.getElementById('e-id').value = tx.id;
            document.getElementById('e-amount').value = tx.amount;
            document.getElementById('e-desc').value = tx.desc;
            const _eTime = document.getElementById('e-time');
            _eTime.value = new Date(new Date(tx.date) - new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
            _eTime.max = new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
            setType(tx.type || 'expense');
            selectCatGrid(tx.cat);
            document.getElementById('btn-delete').classList.remove('hidden');
            document.getElementById('edit-modal').classList.remove('hidden');
        }
        
        function updateHomeFilters() {
            // Placeholder to keep original calls safe, but logic moved to applyDateFilter
        }

        // PWA: Register external service worker + auto-update
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').then(reg => {
                reg.addEventListener('updatefound', () => {
                    const nw = reg.installing;
                    if (nw) nw.addEventListener('statechange', () => {
                        if (nw.state === 'activated') console.info('新版本已就绪，下次打开时使用。');
                    });
                });
                setInterval(() => reg.update(), 60 * 1000);
            }).catch(() => {});
        }

    
function viewAllHistory() { showAllHistory = true; listFilterType = 'all'; listFilterCat = 'all'; document.getElementById('label-cat').textContent = t('all_cats'); document.getElementById('label-type').textContent = '收支'; renderTransactionList(); }

// Backup settings sheet: focus containment, scroll locking, and drag dismissal.
let storagePanelState = null;
let storagePanelClosing = false;
function openStoragePanel() {
    if (storagePanelState || storagePanelClosing) return;
    const panel = document.getElementById('storage-panel');
    storagePanelState = {
        focus: document.activeElement,
        scrollY: window.scrollY,
        body: ['overflow','position','top','width'].map(key => [key,document.body.style[key]]),
        background: [...document.querySelectorAll('main,nav')].map(el => [el,el.inert])
    };
    storagePanelState.background.forEach(([el]) => { el.inert = true; });
    Object.assign(document.body.style,{overflow:'hidden',position:'fixed',top:`-${storagePanelState.scrollY}px`,width:'100%'});
    document.getElementById('storage-feedback').textContent = '';
    panel.classList.remove('hidden');
    lucide.createIcons();
    panel.focus({preventScroll:true});
    requestAnimationFrame(() => panel.classList.add('is-open'));
    document.addEventListener('keydown', handleStoragePanelKey);
    initStoragePanelDrag();
}
function closeStoragePanel() {
    if (!storagePanelState || storagePanelClosing) return;
    storagePanelClosing = true;
    const panel = document.getElementById('storage-panel');
    panel.classList.remove('is-open');
    document.removeEventListener('keydown', handleStoragePanelKey);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => {
        panel.classList.add('hidden');
        const previous = storagePanelState;
        previous.body.forEach(([key,value]) => { document.body.style[key] = value; });
        previous.background.forEach(([el,inert]) => { el.inert = inert; });
        window.scrollTo(0,previous.scrollY);
        previous.focus?.focus({preventScroll:true});
        storagePanelState = null;
        storagePanelClosing = false;
    }, reduced ? 0 : 320);
}
function handleStoragePanelKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); closeStoragePanel(); return; }
    if (event.key !== 'Tab') return;
    const panel = document.getElementById('storage-panel');
    const buttons = [...panel.querySelectorAll('button:not(:disabled)')];
    const first = buttons[0], last = buttons[buttons.length-1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) { event.preventDefault(); first.focus(); }
}
function initStoragePanelDrag() {
    const panel = document.getElementById('storage-panel');
    const header = panel.querySelector('.storage-panel-header');
    if (header.dataset.dragReady) return;
    header.dataset.dragReady = 'true';
    const sheet = panel.querySelector('.storage-sheet');
    let start = null, distance = 0;
    header.addEventListener('pointerdown', event => {
        if (event.target.closest('button') || !event.isPrimary || event.button !== 0) return;
        start = event.clientY; distance = 0;
        header.setPointerCapture(event.pointerId);
        sheet.style.transition = 'none';
    });
    header.addEventListener('pointermove', event => {
        if (start === null) return;
        distance = Math.max(0,event.clientY-start);
        sheet.style.transform = `translate(-50%,${distance}px)`;
    });
    const endDrag = event => {
        if (start === null) return;
        start = null;
        sheet.style.transition = '';
        sheet.style.transform = '';
        if (header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId);
        if (event.type !== 'pointercancel' && distance > 80) closeStoragePanel();
    };
    header.addEventListener('pointerup',endDrag);
    header.addEventListener('pointercancel',endDrag);
}
function exportStorageBackup() {
    nfStorage.exportBackup();
    document.getElementById('storage-feedback').textContent = '备份文件已生成，请在下载菜单中保存到“文件”。';
}
async function protectLocalStorage(button) {
    button.disabled = true;
    const feedback = document.getElementById('storage-feedback');
    feedback.textContent = '正在检查本机保护…';
    try {
        await nfStorage.requestPersistence();
        feedback.textContent = document.getElementById('storage-status').textContent;
    } catch {
        feedback.textContent = '暂时无法申请保护，请先备份到“文件”。';
    } finally { button.disabled = false; }
}

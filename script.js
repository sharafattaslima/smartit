// ==UserScript==
// @name         SMARTIT IVAC MASTER PRO (@S) - CapSolver Dual Mode V2.21 (Fast Mode Fix & Network Retry)
// @namespace    smartit.ivac.pro.v2.capsolver
// @version      2.22
// @description  Safe Token Burn, Auto OTP, Live API Parsing, Network Retry, Real Fast Mode Logic + Popup Fix
// @author       MD YEASIR SHARAFAT
// @match        https://appointment.ivacbd.com/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';
    // --- ১. কনফিগ ---
    const SETTINGS = {
        phone: localStorage.getItem('ivac_phone') || "01410070607",
        pass: localStorage.getItem('ivac_pass') || "Dhaka@123",
        capKey: localStorage.getItem('ivac_capsolver_key') || "",
        scanSpeed: 250,
        apiMinDelay: 1000,
        apiMaxDelay: 2800,
        fastMin: 3500, fastMax: 6000,
        stealthMin: 12000, stealthMax: 22000
    };

    let apiHitCount = parseInt(sessionStorage.getItem('ivac_api_hits')) || 0;
    let lastServerReply = sessionStorage.getItem('ivac_last_reply') || 'None';
    let savedLiveLogs = sessionStorage.getItem('ivac_live_logs') || '';
    let savedPanelState = JSON.parse(localStorage.getItem('ivac_panel_state') || '{}');
    if (savedPanelState.t && parseInt(savedPanelState.t) < 0) savedPanelState.t = '15px';
    if (savedPanelState.l && parseInt(savedPanelState.l) < 0) savedPanelState.l = '15px';
    if (savedPanelState.t && parseInt(savedPanelState.t) > window.innerHeight) savedPanelState.t = '15px';
    if (savedPanelState.l && parseInt(savedPanelState.l) > window.innerWidth) savedPanelState.l = '15px';

    let lastPastedOTP = "";
    let activeGlowBtnId = null;

    // API Execution Locks (Prevents double clicks/triggers)
    let isSigningIn = false;
    let isVerifyingOtp = false;
    let isReservingApi = false;

    const CAPTCHA_LIFETIME = 120000;
    let globalCaptchaToken = localStorage.getItem('ivac_captcha_token') || "";
    let globalCaptchaTimestamp = parseInt(localStorage.getItem('ivac_captcha_timestamp')) || 0;

    if (globalCaptchaToken && (Date.now() - globalCaptchaTimestamp >= CAPTCHA_LIFETIME)) {
        globalCaptchaToken = ""; globalCaptchaTimestamp = 0;
        localStorage.removeItem('ivac_captcha_token'); localStorage.removeItem('ivac_captcha_timestamp');
    }

    function saveCaptchaToken(token, source = "Manual") {
        if (!token || token.length < 20) return;
        if (token === globalCaptchaToken) return;
        globalCaptchaToken = token; globalCaptchaTimestamp = Date.now();
        localStorage.setItem('ivac_captcha_token', globalCaptchaToken);
        localStorage.setItem('ivac_captcha_timestamp', globalCaptchaTimestamp.toString());
        addLog(`✅ [${source}] Captcha Cached!`, "success");
    }

    function clearCaptchaCache(reason) {
        globalCaptchaToken = ""; globalCaptchaTimestamp = 0;
        localStorage.removeItem('ivac_captcha_token'); localStorage.removeItem('ivac_captcha_timestamp');
        let grecaptchaEl = document.querySelector('[name="g-recaptcha-response"]'); if (grecaptchaEl) grecaptchaEl.value = "";
        let manualEl = document.querySelector('input[name="captchaToken"]'); if (manualEl) manualEl.value = "";
        try { if (typeof grecaptcha !== 'undefined' && grecaptcha.reset) grecaptcha.reset(); } catch(e){}
        addLog(`🔥 Token Burned: ${reason}`, "warning");
    }

    setInterval(() => {
        let manualToken = document.querySelector('[name="g-recaptcha-response"]')?.value || document.querySelector('input[name="captchaToken"]')?.value;
        if (manualToken && manualToken.length > 20 && manualToken !== globalCaptchaToken) saveCaptchaToken(manualToken, "Manual");
        if (globalCaptchaToken && (Date.now() - globalCaptchaTimestamp >= CAPTCHA_LIFETIME)) clearCaptchaCache("Expired (120s)");
    }, 500);

    let existingToken = localStorage.getItem('token');
    if (!existingToken) {
        try { let authStore = JSON.parse(localStorage.getItem('auth-storage')); if (authStore && authStore.state && authStore.state.token) existingToken = authStore.state.token; } catch(e) {}
    }
    let authToken = existingToken ? "Bearer " + existingToken : null;
    let currentRequestId = localStorage.getItem('ivac_req_id') || null;
    let automationActive = sessionStorage.getItem('ivac_auto_active') === 'false' ? false : true;
    let fastHitActive = sessionStorage.getItem('ivac_fast_active') === 'true' ? true : false;
    let signInRetryTimeout = null, otpRetryTimeout = null, clipboardInterval = null;
    let timeOffset = parseInt(sessionStorage.getItem('ivac_time_offset')) || 0;

    function syncIVACServerTime() {
        fetch(window.location.origin, { method: 'HEAD', cache: 'no-store' }).then(res => {
            try { let dateHeader = res.headers.get('Date'); if (dateHeader) { timeOffset = new Date(dateHeader).getTime() - Date.now(); sessionStorage.setItem('ivac_time_offset', timeOffset); } } catch(e) {}
        }).catch(()=>{});
    }
    syncIVACServerTime(); window.addEventListener('load', syncIVACServerTime);
    let origPushState = history.pushState; history.pushState = function() { origPushState.apply(this, arguments); syncIVACServerTime(); };

    function getBDTime() { return new Date(Date.now() + timeOffset).toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka', hour12: true }); }

    GM_addStyle(`
        #ivac-hybrid-panel { position: fixed; top: 15px; right: 15px; width: 420px; background: #ffffff; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,0,0,0.05); z-index: 999999999 !important; font-family: 'Inter', system-ui, sans-serif; color: #1e293b; transition: box-shadow 0.3s ease; overflow: hidden; min-width: 330px; min-height: 400px; display: flex; flex-direction: column; cursor: grab; }
        #ivac-hybrid-panel:active { cursor: grabbing; }
        #ivac-hybrid-panel:hover { box-shadow: 0 30px 60px -15px rgba(0,0,0,0.5), 0 0 0 1px rgba(16,185,129,0.3); }
        .ui-header { background: linear-gradient(135deg, #10b981, #059669); padding: 16px 20px; font-weight: 700; text-align: center; color: white; display: flex; justify-content: space-between; align-items: center; border-radius: 16px 16px 0 0; font-size: 16px; user-select: none; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); flex-shrink: 0; }
        #close-btn { transition: all 0.2s ease; border-radius: 6px; border: none; outline: none; display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; font-size: 14px; cursor: pointer; background: rgba(0,0,0,0.2); color: white; z-index: 101; }
        #close-btn:hover { background: #ef4444 !important; transform: scale(1.05) rotate(90deg); }
        .ui-body { padding: 18px 18px 15px 18px; position: relative; display: flex; flex-direction: column; flex: 1; overflow-y: auto; cursor: default; }
        #live-details-box { background: #f0fdf4; border: 1px solid #a7f3d0; border-radius: 10px; padding: 12px; margin-bottom: 12px; font-family: 'Fira Code', monospace; font-size: 12px; color: #064e3b; display: flex; flex-direction: column; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); cursor: default; flex-shrink: 0; }
        .detail-value { background: #ffffff; padding: 3px 6px; border-radius: 6px; border: 1px solid #d1fae5; font-weight: 700; color: #047857; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; box-shadow: 0 1px 2px rgba(0,0,0,0.05); min-width: 0; flex: 1; }
        #detail-response::-webkit-scrollbar, #live-log::-webkit-scrollbar { width: 6px; }
        #detail-response::-webkit-scrollbar-track { background: rgba(254, 202, 202, 0.3); border-radius: 10px; }
        #detail-response::-webkit-scrollbar-thumb { background: #f87171; border-radius: 10px; }
        .log-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding: 0 4px; cursor: default; flex-shrink: 0; }
        #btn-clear-log { cursor: pointer; font-size: 11px; font-weight: 700; color: #ef4444; background: #fee2e2; padding: 4px 10px; border-radius: 6px; transition: all 0.2s ease; border: 1px solid transparent; }
        #btn-clear-log:hover { background: #ef4444; color: white; border-color: #dc2626; box-shadow: 0 2px 4px rgba(239,68,68,0.2); }
        #live-log { flex: 1; min-height: 80px; background: #0f172a; border-radius: 10px; padding: 12px; overflow-y: auto; color: #4ade80; font-size: 11px; border: 1px solid #1e293b; margin-bottom: 12px; font-family: 'Fira Code', Consolas, monospace; word-wrap: break-word; box-shadow: inset 0 2px 10px rgba(0,0,0,0.5); line-height: 1.5; cursor: text; }
        #live-log::-webkit-scrollbar-track { background: #1e293b; border-radius: 10px; }
        #live-log::-webkit-scrollbar-thumb { background: #475569; border-radius: 10px; }
        .log-entry { margin-bottom: 8px; border-bottom: 1px dashed #1e293b; padding-bottom: 8px; }
        .log-entry pre { margin: 0; font-family: inherit; white-space: pre-wrap; }
        .log-entry a { pointer-events: auto !important; }
        .btn-glossy { width: 100%; padding: 14px 20px; margin-top: 10px; border: none; border-radius: 50px; font-weight: 800; cursor: pointer; color: white; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; transition: all 0.2s ease; box-shadow: 0 6px 12px rgba(0,0,0,0.25), inset 0 4px 5px rgba(255,255,255,0.4), inset 0 -4px 5px rgba(0,0,0,0.2); text-shadow: 0 1px 2px rgba(0,0,0,0.5); position: relative; overflow: hidden; display: flex; justify-content: center; align-items: center; gap: 8px; flex-shrink: 0; z-index: 10; }
        .btn-glossy:active { transform: translateY(3px); box-shadow: 0 2px 5px rgba(0,0,0,0.2), inset 0 2px 4px rgba(0,0,0,0.3); }
        .g-blue { background: linear-gradient(180deg, #3b82f6, #1d4ed8); } .g-green { background: linear-gradient(180deg, #10b981, #047857); } .g-purple { background: linear-gradient(180deg, #a855f7, #6d28d9); } .g-orange { background: linear-gradient(180deg, #f97316, #c2410c); } .g-cyan { background: linear-gradient(180deg, #06b6d4, #0e7490); } .g-red { background: linear-gradient(180deg, #ef4444, #b91c1c); }
        .dot { height: 12px; width: 12px; background: #fb7185; border-radius: 50%; display: inline-block; margin-right: 8px; vertical-align: middle; box-shadow: 0 0 8px rgba(251,113,133,0.6); transition: all 0.3s ease; }
        .dot-green { background: #34d399 !important; box-shadow: 0 0 8px rgba(52,211,153,0.6) !important; } .dot-yellow { background: #fbbf24 !important; box-shadow: 0 0 8px rgba(251,191,36,0.6) !important; }
        .ui-input-small { flex: 1; padding: 10px 12px; border: 2px solid #e2e8f0; border-radius: 8px; text-align: center; font-weight: 600; outline: none; transition: all 0.3s ease; background: #f8fafc; color: #0f172a; font-family: 'Inter', sans-serif; cursor: text; min-width: 0; z-index: 10; user-select: text !important; -webkit-user-select: text !important;}
        .ui-input-small:hover { border-color: #cbd5e1; } .ui-input-small:focus { border-color: #3b82f6; background: #ffffff; box-shadow: 0 0 0 4px rgba(59,130,246,0.15); transform: translateY(-1px); }
        .ui-input-otp { width: 100%; padding: 16px; text-align: center; border: 2px solid #e2e8f0; border-radius: 12px; font-size: 24px; margin-top: 8px; font-weight: 800; background: #f8fafc; letter-spacing: 6px; color: #0f172a; outline: none; transition: all 0.3s ease; box-shadow: inset 0 2px 4px rgba(0,0,0,0.03); cursor: text; flex-shrink: 0; z-index: 10; user-select: text !important; -webkit-user-select: text !important;}
        .ui-input-otp:hover { border-color: #cbd5e1; } .ui-input-otp:focus { border-color: #10b981; background: #ffffff; box-shadow: 0 0 0 4px rgba(16,185,129,0.15), inset 0 2px 4px rgba(0,0,0,0.03); transform: translateY(-1px); }
        @keyframes api-working-pulse { 0% { box-shadow: 0 6px 12px rgba(0,0,0,0.25), inset 0 4px 6px rgba(255,255,255,0.4), inset 0 -4px 6px rgba(0,0,0,0.2), 0 0 5px rgba(234, 179, 8, 0.6); } 50% { box-shadow: 0 6px 12px rgba(0,0,0,0.25), inset 0 4px 6px rgba(255,255,255,0.4), inset 0 -4px 6px rgba(0,0,0,0.2), 0 0 20px 8px rgba(234, 179, 8, 1); transform: scale(1.02); } 100% { box-shadow: 0 6px 12px rgba(0,0,0,0.25), inset 0 4px 6px rgba(255,255,255,0.4), inset 0 -4px 6px rgba(0,0,0,0.2), 0 0 5px rgba(234, 179, 8, 0.6); } }
        .btn-highlight { animation: api-working-pulse 1.5s infinite !important; background: linear-gradient(180deg, #facc15, #a16207) !important; color: #ffffff !important; text-shadow: 0 1px 2px rgba(0,0,0,0.5) !important; z-index: 20 !important; }
        * { user-select: text !important; -webkit-user-select: text !important; }
        #ivac-toast-container { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999999999; display: flex; flex-direction: column; gap: 12px; pointer-events: none; }
        .ivac-toast { background: #fffbfa; display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-radius: 12px; font-family: 'Inter', system-ui, sans-serif; min-width: 320px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); pointer-events: auto; animation: toastSlideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; border: 1px solid transparent; }
        .ivac-toast.error { border-color: #f87171; } .ivac-toast.success { background: #f0fdf4; border-color: #4ade80; }
        .ivac-toast-left { display: flex; align-items: center; gap: 14px; } .ivac-toast-icon { display: flex; align-items: center; justify-content: center; } .ivac-toast-text { display: flex; flex-direction: column; }
        .ivac-toast-title { font-weight: 600; font-size: 16px; margin-bottom: 2px; } .ivac-toast.error .ivac-toast-title, .ivac-toast.error .ivac-toast-msg { color: #7f1d1d; } .ivac-toast.success .ivac-toast-title, .ivac-toast.success .ivac-toast-msg { color: #14532d; }
        .ivac-toast-msg { font-size: 14px; font-weight: 500; opacity: 0.9; }
        .ivac-toast-close { cursor: pointer; padding: 4px; display: flex; align-items: center; opacity: 0.6; transition: opacity 0.2s; background: none; border: none; } .ivac-toast-close:hover { opacity: 1; }
        .ivac-toast.error .ivac-toast-close svg { stroke: #7f1d1d; } .ivac-toast.success .ivac-toast-close svg { stroke: #14532d; }
        .ivac-toast.fade-out { animation: toastFadeOut 0.3s ease forwards; }
        @keyframes toastSlideIn { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } } @keyframes toastFadeOut { from { opacity: 1; transform: translateY(0) scale(0.95); } to { opacity: 0; transform: translateY(-10px) scale(0.95); } }
    `);

    function fetchGM(url, options) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: options.method || "GET", url: url, headers: options.headers || {}, data: options.body,
                onload: function(response) { resolve({ status: response.status, ok: response.status >= 200 && response.status < 300, json: () => Promise.resolve(JSON.parse(response.responseText)) }); },
                onerror: function(err) { reject(err); }
            });
        });
    }

    function getRecaptchaSiteKey() {
        let el = document.querySelector('[data-sitekey]'); if (el) return el.getAttribute('data-sitekey');
        let iframe = document.querySelector('iframe[src*="recaptcha/api2/anchor"]'); if (iframe) { let match = iframe.src.match(/k=([^&]+)/); if (match) return match[1]; }
        let script = document.querySelector('script[src*="recaptcha/api.js?render="]'); if (script) { let match = script.src.match(/render=([^&]+)/); if (match) return match[1]; }
        return null;
    }

    async function autoSolveCaptcha(apiKey, siteKey, pageUrl) {
        try {
            let createRes = await fetchGM("https://api.capsolver.com/createTask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientKey: apiKey, task: { type: "ReCaptchaV2TaskProxyless", websiteURL: pageUrl, websiteKey: siteKey, isInvisible: false } }) });
            let createData = await createRes.json();
            if (createData.errorId !== 0) { addLog(`❌ CapSolver Error: ${createData.errorDescription}`, "error"); return null; }
            let taskId = createData.taskId; addLog(`🤖 CapSolver Task: ${taskId}... Waiting`, "info");
            for (let i = 0; i < 60; i++) {
                if (globalCaptchaToken && (Date.now() - globalCaptchaTimestamp < CAPTCHA_LIFETIME)) { addLog("🛑 CapSolver Aborted: Manual Token detected first!", "warning"); return globalCaptchaToken; }
                await new Promise(r => setTimeout(r, 2000));
                let pollRes = await fetchGM("https://api.capsolver.com/getTaskResult", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientKey: apiKey, taskId: taskId }) });
                let pollData = await pollRes.json();
                if (pollData.status === "ready") { let token = pollData.solution.gRecaptchaResponse; saveCaptchaToken(token, "CapSolver"); return token; }
                else if (pollData.status === "failed" || pollData.errorId !== 0) { addLog(`❌ CapSolver Failed: ${pollData.errorDescription || 'Unknown Error'}`, "error"); return null; }
            }
            addLog("❌ CapSolver Timeout!", "error"); return null;
        } catch (e) { addLog(`❌ CapSolver Exception: ${e.message}`, "error"); return null; }
    }

    function setPersistentGlow(btnId) {
        if (activeGlowBtnId && activeGlowBtnId !== btnId) { let oldBtn = document.getElementById(activeGlowBtnId); if (oldBtn) oldBtn.classList.remove('btn-highlight'); }
        activeGlowBtnId = btnId; let newBtn = document.getElementById(btnId); if (newBtn) newBtn.classList.add('btn-highlight');
    }

    function copyToClip(text) {
        navigator.clipboard.writeText(text).then(() => { showToast("Success", "Link Copied!", "success"); }).catch(e => {
            let tempInput = document.createElement("input"); tempInput.value = text; document.body.appendChild(tempInput);
            tempInput.select(); document.execCommand("copy"); document.body.removeChild(tempInput); showToast("Success", "Link Copied!", "success");
        });
    }

    function showToast(title, message, type = 'error') {
        let container = document.getElementById('ivac-toast-container');
        if (!container) { container = document.createElement('div'); container.id = 'ivac-toast-container'; document.body.appendChild(container); }
        const toast = document.createElement('div'); toast.className = `ivac-toast ${type}`;
        let iconSvg = type === 'error' ? `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" fill="#fee2e2"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>` : `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" fill="#dcfce7"></circle><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        toast.innerHTML = `<div class="ivac-toast-left"><div class="ivac-toast-icon">${iconSvg}</div><div class="ivac-toast-text"><span class="ivac-toast-title">${title}</span><span class="ivac-toast-msg">${message}</span></div></div><button class="ivac-toast-close" title="Close"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`;
        container.appendChild(toast);
        const closeBtn = toast.querySelector('.ivac-toast-close');
        const removeToast = () => { toast.classList.add('fade-out'); setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300); };
        closeBtn.onclick = removeToast; setTimeout(removeToast, 4000);
    }

    function interceptApiCall(url) {
        if (!url) return false; return url.includes('/slots/reserveSlot') || url.includes('/auth/signin') || url.includes('/otp/verifySigninOtp') || url.includes('/file/payment-amount') || url.includes('/file-confirmation-and-slot-status') || url.includes('/get-booking-config');
    }

    function formatPreview(data) {
        try { let clean = JSON.parse(JSON.stringify(data)); if (clean.data && clean.data.accessToken) clean.data.accessToken = "[HIDDEN]"; if (clean.accessToken) clean.accessToken = "[HIDDEN]"; if (clean.data && clean.data.token) clean.data.token = "[HIDDEN]"; if (clean.data && clean.data.refreshToken) clean.data.refreshToken = "[HIDDEN]"; return JSON.stringify(clean, null, 2); } catch(e) { return JSON.stringify(data); }
    }

    function processServerReply(data, status, url) {
        let uiMsg = `Status: ${status}`; let rawLogMsg = "";
        if (typeof data === 'string') {
            if (data.includes('503') || data.toLowerCase().includes('service unavailable') || data.toLowerCase().includes('cloudflare')) uiMsg = "503 Server Busy / Cloudflare"; else if (data.includes('502') || data.toLowerCase().includes('bad gateway')) uiMsg = "502 Bad Gateway"; else if (data.includes('504') || data.toLowerCase().includes('gateway timeout')) uiMsg = "504 Gateway Timeout"; else uiMsg = `HTML/Text Error (${status})`;
            rawLogMsg = data.length > 250 ? data.substring(0, 250) + '...[TRUNCATED HTML]' : data;
        } else if (data) {
            if (data.message) uiMsg = data.message; else if (data.error) uiMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error); else if (typeof data.data === 'string') uiMsg = data.data; else if (data.status) uiMsg = data.status; else if (data.statusCode) uiMsg = `Error: ${data.statusCode}`;
            rawLogMsg = formatPreview(data);
        }

        // --- LIVE API PARSING (Date, Time, Slots) ---
        try {
            if (data && typeof data === 'object') {
                let strData = JSON.stringify(data);
                if (strData.includes('appointmentDate') || url.includes('booking-config') || url.includes('slot')) {
                    let dMatch = strData.match(/\b(?:202\d-\d{2}-\d{2}|\d{2}-\d{2}-202\d)\b/g);
                    let tMatch = strData.match(/\b\d{1,2}:\d{2}(?:\s*[AP]M)?\s*-\s*\d{1,2}:\d{2}(?:\s*[AP]M)?\b/gi);
                    if(!tMatch) { let altMatch = strData.match(/"slotTime"\s*:\s*"([^"]+)"/gi); if(altMatch) tMatch = altMatch.map(m => m.split('"')[3]); }

                    if (dMatch && dMatch.length > 0) { updateLiveDetails('date', dMatch[dMatch.length - 1]); }
                    if (tMatch && tMatch.length > 0) {
                        let uT = [...new Set(tMatch)];
                        updateLiveDetails('time', uT[0]);
                        updateLiveDetails('slots', `${uT.length} Slot(s) Live!`);
                        document.getElementById('detail-slots').style.color = '#059669';
                    } else if (strData.includes('No slot available') || strData.includes('"availableSlot":0')) {
                        updateLiveDetails('slots', '0 Slots');
                        document.getElementById('detail-slots').style.color = '#dc2626';
                    }
                }
            }
        } catch(e) {}

        sessionStorage.setItem('ivac_last_reply', uiMsg);
        const elResp = document.getElementById('detail-response'); if (elResp) { elResp.innerText = uiMsg; }
        let endpoint = typeof url === 'string' ? url.split('/').pop() : 'API';
        addLog(`📥 [${endpoint}]:\n${rawLogMsg}`, (status >= 200 && status < 300) ? "success" : "error");
    }

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        let url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || ''); let isTarget = interceptApiCall(url);
        if (isTarget) { apiHitCount++; sessionStorage.setItem('ivac_api_hits', apiHitCount); const elHits = document.getElementById('detail-api-hits'); if (elHits) elHits.innerText = apiHitCount; const elResp = document.getElementById('detail-response'); if (elResp) elResp.innerText = 'Waiting for reply...'; }
        try {
            const response = await originalFetch.apply(this, args);
            try { let dateHeader = response.headers.get('Date'); if (dateHeader) { timeOffset = new Date(dateHeader).getTime() - Date.now(); sessionStorage.setItem('ivac_time_offset', timeOffset); } } catch(e) {}
            if (isTarget) { const clone = response.clone(); clone.text().then(text => { try { processServerReply(JSON.parse(text), response.status, url); } catch(e) { processServerReply(text, response.status, url); } }).catch(()=>{}); }
            return response;
        } catch(e) {
            if (isTarget) { const elResp = document.getElementById('detail-response'); if (elResp) elResp.innerText = 'Network/Connection Error'; addLog(`📥 [API FETCH FAILED]: Code 0 | ${e.toString()}`, "error"); } throw e;
        }
    };

    const origOpen = XMLHttpRequest.prototype.open; const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) { this._url = url; origOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function() {
        let isTarget = interceptApiCall(this._url);
        if (isTarget) {
            apiHitCount++; sessionStorage.setItem('ivac_api_hits', apiHitCount); const elHits = document.getElementById('detail-api-hits'); if (elHits) elHits.innerText = apiHitCount; const elResp = document.getElementById('detail-response'); if (elResp) elResp.innerText = 'Waiting for reply...';
            this.addEventListener('load', function() {
                try { let dateHeader = this.getResponseHeader('Date'); if (dateHeader) { timeOffset = new Date(dateHeader).getTime() - Date.now(); sessionStorage.setItem('ivac_time_offset', timeOffset); } } catch(e) {}
                try { processServerReply(JSON.parse(this.responseText), this.status, this._url); } catch(e) { processServerReply(this.responseText, this.status, this._url); }
            });
        }
        origSend.apply(this, arguments);
    };

    function setupCustomResize(panel) {
        const c=(cl,cu)=>{let e=document.createElement('div');e.className=cl;e.style.cssText=`position:absolute;z-index:1000;cursor:${cu};`;panel.appendChild(e);return e;};
        const rr=c('resizer-r','ew-resize'),rl=c('resizer-l','ew-resize'),rb=c('resizer-b','ns-resize'),rbr=c('resizer-br','nwse-resize'),rbl=c('resizer-bl','nesw-resize');
        rr.style.cssText+='right:0;top:0;width:8px;height:100%;'; rl.style.cssText+='left:0;top:0;width:8px;height:100%;'; rb.style.cssText+='bottom:0;left:0;width:100%;height:8px;';
        rbr.style.cssText+='bottom:0;right:0;width:16px;height:16px;'; rbr.innerHTML='<svg style="position:absolute;bottom:4px;right:4px;opacity:0.6;pointer-events:none;" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15l-6 6M21 8l-13 13M21 1l-20 20"/></svg>';
        rbl.style.cssText+='bottom:0;left:0;width:16px;height:16px;';
        let sx,sy,sw,sh,sl;
        const md=function(e){ e.preventDefault();e.stopPropagation();sx=e.clientX;sy=e.clientY;sw=panel.offsetWidth;sh=panel.offsetHeight;sl=panel.offsetLeft;const rs=this;
            function dd(e){ if(rs===rr||rs===rbr){let nw=sw+(e.clientX-sx);if(nw>=330)panel.style.width=nw+'px';}if(rs===rl||rs===rbl){let nw=sw-(e.clientX-sx);if(nw>=330){panel.style.width=nw+'px';panel.style.left=(sl+(e.clientX-sx))+'px';}}if(rs===rb||rs===rbr||rs===rbl){let nh=sh+(e.clientY-sy);if(nh>=400)panel.style.height=nh+'px';} }
            function sd(){ document.removeEventListener('mousemove',dd);document.removeEventListener('mouseup',sd);savedPanelState.w=panel.style.width;savedPanelState.h=panel.style.height;if(panel.style.left){savedPanelState.l=panel.style.left;savedPanelState.r='auto';}localStorage.setItem('ivac_panel_state',JSON.stringify(savedPanelState)); }
            document.addEventListener('mousemove',dd);document.addEventListener('mouseup',sd);
        };
        [rr,rl,rb,rbr,rbl].forEach(e=>e.addEventListener('mousedown',md));
    }

    function setupDrag(panel) {
        let p1=0,p2=0,p3=0,p4=0;
        panel.onmousedown=(e)=>{
            const t=e.target;
            if(!t || ['INPUT', 'TEXTAREA', 'BUTTON', 'A'].includes(t.tagName) || t.isContentEditable || t.closest('input') || t.closest('button') || t.closest('#live-log') || t.closest('#detail-response') || (typeof t.className==='string' && t.className.includes('resizer')) || t.closest('.resizer-br') || t.closest('.resizer-bl')) { return; }
            e.preventDefault(); p3=e.clientX;p4=e.clientY;
            document.onmouseup=()=>{ document.onmouseup=null;document.onmousemove=null;savedPanelState.t=panel.style.top;savedPanelState.l=panel.style.left;savedPanelState.r='auto';localStorage.setItem('ivac_panel_state',JSON.stringify(savedPanelState)); };
            document.onmousemove=(e)=>{ p1=p3-e.clientX;p2=p4-e.clientY;p3=e.clientX;p4=e.clientY;panel.style.top=(panel.offsetTop-p2)+"px";panel.style.left=(panel.offsetLeft-p1)+"px"; };
        };
    }

    function addLog(msg, type = 'info') {
        const box = document.getElementById('live-log'); if (!box) return;
        const div = document.createElement('div'); div.className = 'log-entry';
        let msgColor = type === 'success' ? '#4ade80' : (type === 'error' ? '#fb7185' : (type === 'warning' ? '#facc15' : '#cbd5e1'));
        div.style.color = msgColor;
        div.innerHTML = `<span style="color: #00ffff; font-weight: bold;">[${getBDTime()}]</span>\n<pre style="white-space: pre-wrap; word-break: break-all;">${msg}</pre>`;
        box.prepend(div); if (box.childNodes.length > 50) box.lastChild.remove();
        sessionStorage.setItem('ivac_live_logs', box.innerHTML);
    }

    function updateLiveDetails(key, value) { const el = document.getElementById(`detail-${key}`); if (el) { el.innerText = value; el.title = value; } }

    function checkAuthStatus() {
        if (!authToken) { let currentStorageToken = localStorage.getItem('token'); if(currentStorageToken) authToken = "Bearer " + currentStorageToken; }
        if (authToken) { document.getElementById('token-dot')?.classList.add('dot-green'); document.getElementById('token-dot')?.classList.remove('dot-yellow'); updateLiveDetails('auth', 'Active'); document.getElementById('detail-auth').style.color = '#059669'; }
        else if (currentRequestId) { document.getElementById('token-dot')?.classList.add('dot-yellow'); document.getElementById('token-dot')?.classList.remove('dot-green'); updateLiveDetails('auth', 'Pending OTP'); document.getElementById('detail-auth').style.color = '#d97706'; }
        else { document.getElementById('token-dot')?.classList.remove('dot-green', 'dot-yellow'); updateLiveDetails('auth', 'Inactive'); document.getElementById('detail-auth').style.color = '#dc2626'; }
    }

    async function preloadDashboardData(token) {
        try {
            addLog("🔄 [API] Preloading Dashboard APIs...", "info");
            await Promise.all([
                fetch("https://api.ivacbd.com/iams/api/v1/file/file-confirmation-and-slot-status", { method: "GET", headers: { "Accept": "application/json", "Authorization": "Bearer " + token } }).catch(()=>null),
                fetch("https://api.ivacbd.com/iams/api/v1/appointment/get-booking-config", { method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify({}) }).catch(()=>null)
            ]);
            addLog("✅ [API] Preload Complete", "success");
        } catch(e) {}
    }

    // ==========================================
    // মডিফাইড safeNavigateToPayment ফাংশন
    // ==========================================
    async function safeNavigateToPayment() {
        // ব্রাউজারের পপআপ ব্লকার বাইপাস করার জন্য ইউজারের ক্লিকের সাথে সাথেই একটি ব্ল্যাঙ্ক ট্যাব ওপেন করা হলো
        let paymentTab = null;
        try {
            paymentTab = window.open('', '_blank');
            if (paymentTab) {
                paymentTab.document.write('<html style="background:#0f172a;"><body style="color:#10b981; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; font-size:24px;">⏳ Loading Payment Gateway... Please wait.</body></html>');
            }
        } catch(e) {}

        try {
            const payBtn = document.getElementById('popup-pay-btn');
            if(payBtn) { payBtn.innerHTML = "⏳ INITIATING GATEWAY..."; payBtn.style.opacity = "0.7"; payBtn.style.pointerEvents = "none"; }

            const rawToken = localStorage.getItem('token');
            const resId = localStorage.getItem('reservationId') || sessionStorage.getItem('reservationId');
            const payload = resId ? { reservationId: resId } : {};

            const res = await fetch("https://api.ivacbd.com/iams/api/v1/payment/ssl/initiate", {
                method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/json", "Authorization": "Bearer " + rawToken },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (data.successFlag && data.data) {
                const gatewayUrl = data.data.GatewayPageURL || data.data.redirectGatewayURL;
                if (gatewayUrl) {
                    let logMsg = `💰 Payment Link Generated!<br><a href="${gatewayUrl}" target="_blank" style="color:#60a5fa; text-decoration:underline;">Click to Open</a><br><button data-copy="${gatewayUrl}" style="margin-top:8px; padding:6px 12px; background:#3b82f6; color:white; font-weight:bold; border:none; border-radius:6px; cursor:pointer; font-size:11px; z-index:99999;">📋 COPY LINK</button>`;
                    addLog(logMsg, "success");

                    // API থেকে লিংক পাওয়ার পর আগে থেকে ওপেন করে রাখা ট্যাবে লিংকটি পুশ করে দেয়া হলো
                    if (paymentTab) {
                        paymentTab.location.href = gatewayUrl;
                    } else {
                        // যদি উপরের ব্ল্যাঙ্ক ট্যাব ওপেন না হয়ে থাকে (খুব রেয়ার), তবে ডিরেক্ট খোলার চেষ্টা করবে
                        window.open(gatewayUrl, '_blank');
                    }

                    if(payBtn) {
                        payBtn.innerHTML = "✅ OPENED IN NEW TAB"; payBtn.style.background = "linear-gradient(135deg, #3b82f6, #1d4ed8)";
                        setTimeout(() => {
                            payBtn.innerHTML = "💳 CLICK TO RE-OPEN"; payBtn.style.opacity = "1";
                            payBtn.style.pointerEvents = "auto"; payBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
                        }, 3000);
                    }
                    return;
                }
            }

            // যদি লিংক জেনারেট না হয়, তাহলেও মেইন পেজ ঠিক রেখে নতুন ট্যাবেই রিডাইরেক্ট করবে
            if (paymentTab) paymentTab.location.href = '/appointment/continue-payment';
            else window.open('/appointment/continue-payment', '_blank');

        } catch(e) {
            // ফেইল হলেও মেইন পেজ ঠিক রেখে নতুন ট্যাবেই এরর বা ফলব্যাক পেজে যাবে
            if (paymentTab) paymentTab.location.href = '/appointment/continue-payment';
            else window.open('/appointment/continue-payment', '_blank');
        }
    }
    // ==========================================

    function showSuccessPopup(resId) {
        if(document.getElementById('success-payment-popup')) return;
        const popup = document.createElement('div'); popup.id = 'success-payment-popup';
        popup.innerHTML = `
            <div style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15,23,42,0.85); z-index: 99999999999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(8px);">
                <div style="background: #ffffff; padding: 40px; border-radius: 24px; text-align: center; max-width: 450px; box-shadow: 0 25px 50px -12px rgba(16,185,129,0.6); border: 4px solid #10b981;">
                    <div style="font-size: 50px; margin-bottom: 10px;">🎉</div>
                    <h1 style="color: #059669; font-size: 32px; margin-bottom: 10px; font-weight: 900; font-family: 'Inter', sans-serif;">SLOT SECURED!</h1>
                    <p style="color: #475569; font-size: 16px; margin-bottom: 20px; font-weight: 600; font-family: 'Inter', sans-serif;">Your appointment has been successfully confirmed by the server.</p>
                    <div style="background: #f1f5f9; padding: 15px; border-radius: 12px; margin-bottom: 25px; word-break: break-all; font-family: 'Fira Code', monospace; font-size: 13px; color: #0f172a; border: 1px dashed #cbd5e1;">
                        <strong style="color: #3b82f6;">Reservation ID:</strong><br>${resId || 'Check Profile/Dashboard'}
                    </div>
                    <button id="popup-pay-btn" style="display: block; width: 100%; padding: 16px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; font-size: 18px; font-weight: bold; font-family: 'Inter', sans-serif; border-radius: 12px; transition: all 0.2s ease; box-shadow: 0 10px 15px -3px rgba(16,185,129,0.4); cursor: pointer;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                        💳 CLICK HERE TO PAY
                    </button>
                    <button id="popup-close-btn" style="margin-top: 20px; background: transparent; border: none; color: #94a3b8; font-size: 14px; font-weight: bold; cursor: pointer; text-decoration: underline; font-family: 'Inter', sans-serif;">Close this popup</button>
                </div>
            </div>
        `;
        document.body.appendChild(popup);
        document.getElementById('popup-pay-btn').addEventListener('click', safeNavigateToPayment);
        document.getElementById('popup-close-btn').addEventListener('click', () => { document.getElementById('success-payment-popup').remove(); });
    }

    async function pureApiSignIn() {
        if (isSigningIn) return;
        isSigningIn = true;
        clearTimeout(signInRetryTimeout);

        const phoneVal = document.getElementById('ui-phone').value || SETTINGS.phone;
        const passVal = document.getElementById('ui-pass').value || SETTINGS.pass;
        const capKey = document.getElementById('ui-capsolver').value.trim();

        let cToken = globalCaptchaToken;

        if (!cToken || (Date.now() - globalCaptchaTimestamp >= CAPTCHA_LIFETIME)) {
            if (capKey) {
                let siteKey = getRecaptchaSiteKey();
                if(siteKey) {
                    updateLiveDetails('status', 'Solving Captcha...');
                    cToken = await autoSolveCaptcha(capKey, siteKey, window.location.href);
                } else {
                    addLog("⚠️ Could not find ReCaptcha SiteKey on page.", "error");
                    isSigningIn = false;
                    return;
                }
            }
        } else {
            addLog("♻️ Using Cached Captcha Token...", "info");
        }

        if (!cToken || cToken.length < 20) {
            addLog("⚠️ Please solve Captcha manually or configure CapSolver!", "error");
            showToast("Error", "Please solve Captcha first.", "error");
            isSigningIn = false;
            return;
        }

        setPersistentGlow('btn-force-signin');
        const signInBtn = document.getElementById('btn-force-signin');
        if (signInBtn) {
            signInBtn.disabled = true;
            signInBtn.style.opacity = '0.7';
            signInBtn.style.transform = 'translateY(2px)';
            signInBtn.innerHTML = '⏳ REQUESTING...';
        }
        updateLiveDetails('status', 'Signing In...');

        let tokenToUse = cToken;

        try {
            const response = await fetch("https://api.ivacbd.com/iams/api/v1/auth/signin", {
                method: "POST",
                headers: { "Accept": "application/json", "Content-Type": "application/json" },
                body: JSON.stringify({ phone: phoneVal, password: passVal, captchaToken: tokenToUse })
            });

            if (response.status >= 500) throw new Error("ServerBusy");

            const result = await response.json();

            if (response.ok && result.successFlag && result.data?.accessToken) {
                clearCaptchaCache("Consumed for successful Sign-In");

                authToken = result.data.tokenType + " " + result.data.accessToken;
                currentRequestId = result.data.requestId;
                localStorage.setItem('ivac_req_id', currentRequestId);
                checkAuthStatus();
                addLog("✅ [API] LOGIN SUCCESS! Check SMS for OTP.", "success");
                updateLiveDetails('status', 'Waiting for OTP');
                showToast("Success", "Sign-in successful. Check your SMS for OTP.", "success");

                isSigningIn = false;
                if (signInBtn) { signInBtn.disabled = false; signInBtn.style.opacity = '1'; signInBtn.style.transform = ''; signInBtn.innerHTML = "SIGN IN"; }
            } else {
                let errorStr = JSON.stringify(result).toLowerCase();
                if (errorStr.includes('captcha verification failed') || errorStr.includes('invalid captcha') || errorStr.includes('captcha expired') || errorStr.includes('captcha')) {
                    clearCaptchaCache("Captcha Rejected by Server");
                    updateLiveDetails('status', 'Captcha Rejected');
                    addLog("🚨 Captcha rejected/expired! Forcing auto-retry...", "warning");
                    throw new Error("CaptchaRejected");
                } else {
                    updateLiveDetails('status', 'Sign-In Failed');
                    addLog(`🚫 Sign-In Failed: ${result.message || 'Wrong Password/Blocked'}.`, "error");
                    showToast("Error", "Sign-In Failed. Check Credentials.", "error");

                    isSigningIn = false;
                    if (signInBtn) { signInBtn.disabled = false; signInBtn.style.opacity = '1'; signInBtn.style.transform = ''; signInBtn.innerHTML = "SIGN IN"; }
                }
            }
        } catch (e) {
            if (!automationActive) {
                addLog("🛑 Auto-Retry cancelled.", "warning");
                isSigningIn = false;
                if (signInBtn) { signInBtn.disabled = false; signInBtn.style.opacity = '1'; signInBtn.style.transform = ''; signInBtn.innerHTML = "SIGN IN"; }
                return;
            }

            let delay = Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000;
            let reason = e.message === "CaptchaRejected" ? "Captcha Expired" : (e.message === "ServerBusy" ? "Server Busy" : "Network/Connection Error");

            updateLiveDetails('status', `Retry in ${(delay/1000).toFixed(1)}s`);
            addLog(`⚠️ ${reason}. Auto-Retrying in ${(delay/1000).toFixed(1)}s...`, "warning");

            signInRetryTimeout = setTimeout(() => {
                isSigningIn = false;
                pureApiSignIn();
            }, delay);
        }
    }

    async function pureApiVerifyOTP() {
        if (isVerifyingOtp) return;
        isVerifyingOtp = true;
        clearTimeout(otpRetryTimeout);
        try {
            let code = document.getElementById('ui-otp').value.trim();
            if (!code) { addLog("⚠️ OTP Box is blank! Please enter OTP.", "error"); showToast("Error", "Please enter your OTP.", "error"); isVerifyingOtp = false; return; }
            if (!/^\d{6,7}$/.test(code)) { addLog("⚠️ Invalid OTP! Must be 6 or 7 digits.", "error"); showToast("Error", "Invalid OTP format.", "error"); isVerifyingOtp = false; return; }
            if (!authToken || !currentRequestId) { addLog("⚠️ Missing Request ID! Please hit Sign-In first.", "error"); showToast("Error", "Missing Request ID! Hit Sign-In first.", "error"); isVerifyingOtp = false; return; }

            setPersistentGlow('btn-verify'); const verifyBtn = document.getElementById('btn-verify');
            if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.style.opacity = '0.7'; verifyBtn.style.transform = 'translateY(2px)'; verifyBtn.innerHTML = '⏳ VERIFYING...'; }
            updateLiveDetails('status', 'Verifying OTP...');

            const response = await fetch("https://api.ivacbd.com/iams/api/v1/otp/verifySigninOtp", { method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/json", "Authorization": authToken }, body: JSON.stringify({ requestId: currentRequestId, phone: document.getElementById('ui-phone').value || SETTINGS.phone, code: code, otpChannel: "PHONE" }) });
            if (response.status >= 500) throw new Error("Server 5xx Error");
            const result = await response.json();

            if (response.ok && result.successFlag && result.data?.verified) {
                if (verifyBtn) { verifyBtn.innerHTML = "✅ VERIFIED"; verifyBtn.style.background = "linear-gradient(135deg, #10b981, #059669)"; verifyBtn.style.opacity = "1"; }

                checkAuthStatus(); addLog(`🎯 [API] OTP VERIFIED! Injecting Token...`, "success"); updateLiveDetails('status', 'OTP Verified. Injecting...'); showToast("Success", "OTP Verified Successfully!", "success");
                const rawToken = authToken.replace('Bearer ', ''); localStorage.setItem('token', rawToken); sessionStorage.setItem('token', rawToken);
                let authObj = { state: { token: rawToken }, version: 0 }; try { let parsed = JSON.parse(localStorage.getItem('auth-storage')); if (parsed && typeof parsed === 'object') { if (!parsed.state) parsed.state = {}; parsed.state.token = rawToken; authObj = parsed; } } catch(e) {}
                localStorage.setItem('auth-storage', JSON.stringify(authObj)); localStorage.removeItem('ivac_req_id'); currentRequestId = null;

                await preloadDashboardData(rawToken);

                let capKey = document.getElementById('ui-capsolver').value.trim();
                let hasValidCache = globalCaptchaToken && (Date.now() - globalCaptchaTimestamp < CAPTCHA_LIFETIME);
                let siteKey = getRecaptchaSiteKey();

                if (hasValidCache || (capKey && siteKey)) {
                    updateLiveDetails('status', 'Headless Booking...');
                    addLog("⚡ Headless Booking Triggered (Zero UI Load)!", "warning");
                    fireReserveSlotAPI(globalCaptchaToken);
                } else {
                    updateLiveDetails('status', 'Routing to Date Page');
                    setTimeout(() => { window.location.href = '/appointment/time-slot'; }, 200);
                }

            } else { updateLiveDetails('status', 'OTP Failed'); addLog("🚨 Invalid or Expired OTP! Stopped Auto-Retry.", "error"); showToast("Error", "Failed to verify OTP", "error"); }
        } catch(e) {
            if (!automationActive) { addLog("🛑 Auto-Retry cancelled.", "warning"); return; }
            let delay = Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000; updateLiveDetails('status', `5xx/Error - Retry in ${(delay/1000).toFixed(1)}s`); addLog(`⚠️ Server Busy. Auto-Retrying OTP in ${(delay/1000).toFixed(1)}s...`, "warning"); otpRetryTimeout = setTimeout(pureApiVerifyOTP, delay);
        } finally {
            isVerifyingOtp = false;
            const verifyBtn = document.getElementById('btn-verify');
            if (verifyBtn && verifyBtn.innerHTML.includes('VERIFYING')) { verifyBtn.disabled = false; verifyBtn.style.opacity = '1'; verifyBtn.style.transform = ''; verifyBtn.innerHTML = "VERIFY OTP"; }
        }
    }

    async function autoCheckClipboardForOTP() {
        if (!automationActive || isVerifyingOtp) return;
        if (!document.hasFocus() || !document.getElementById('ui-otp')) return;
        try {
            let clipText = await navigator.clipboard.readText();
            clipText = clipText.replace(/[^0-9]/g, '');
            if (clipText.length >= 6 && clipText.length <= 7 && clipText !== lastPastedOTP) {
                let otpInput = document.getElementById('ui-otp');
                if (otpInput && otpInput.value !== clipText) {
                    otpInput.value = clipText;
                    lastPastedOTP = clipText;
                    if (currentRequestId) {
                        addLog(`📋 Auto-detected OTP [${clipText}] from clipboard! Verifying...`, "info");
                        pureApiVerifyOTP();
                    }
                }
            }
        } catch(e) {}
    }

    function autoSelectDateTime() {
        let dates = []; let times = [];
        document.querySelectorAll('div, span, button, .cursor-pointer').forEach(el => {
            let txt = el.innerText?.trim(); if (!txt || el.disabled || el.classList.contains('opacity-50') || el.classList.contains('cursor-not-allowed')) return;
            if (/\d{2}-\d{2}-\d{4}/.test(txt) || /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(txt)) { dates.push(el); } else if (/^\d{1,2}:\d{2}\s*(AM|PM)?\s*-\s*\d{1,2}:\d{2}\s*(AM|PM)?$/.test(txt)) { times.push(el); }
        });
        if (times.length > 0) {
            updateLiveDetails('slots', `${times.length} Slot(s) [UI]!`); document.getElementById('detail-slots').style.color = '#059669';
            let lastTime = times[times.length - 1]; let timeStr = lastTime.innerText.split('\n')[0].trim(); updateLiveDetails('time', timeStr);
        }
        if (dates.length > 0) { let lastDate = dates[dates.length - 1]; let dateStr = lastDate.innerText.trim(); updateLiveDetails('date', dateStr); }
    }

    async function fireReserveSlotAPI(solvedCaptchaToken, isManual = false) {
        if (isReservingApi && !isManual) return;
        isReservingApi = true;
        let retryScheduled = false; // To keep the lock active during retry delays

        const rawToken = localStorage.getItem('token'); if (!rawToken) { isReservingApi = false; addLog("ERR: No Auth Token found!", "error"); return; }
        const capKey = document.getElementById('ui-capsolver').value.trim();

        if (!solvedCaptchaToken || solvedCaptchaToken.length < 20) { solvedCaptchaToken = globalCaptchaToken; }
        if (!solvedCaptchaToken || (Date.now() - globalCaptchaTimestamp >= CAPTCHA_LIFETIME)) {
            if (capKey) {
                let siteKey = getRecaptchaSiteKey();
                if(siteKey) {
                    updateLiveDetails('status', 'Solving Captcha...');
                    addLog("🤖 Auto-Solving Captcha for Booking...", "info");
                    solvedCaptchaToken = await autoSolveCaptcha(capKey, siteKey, window.location.href);
                } else {
                    addLog("⚠️ Routing to Date Page for Captcha...", "warning"); window.location.href = '/appointment/time-slot'; isReservingApi = false; return;
                }
            }
        }

        if (!solvedCaptchaToken || solvedCaptchaToken.length < 20) { isReservingApi = false; addLog("⚠️ Missing Captcha Token for Reservation!", "error"); showToast("Error", "Captcha missing!", "error"); return; }

        setPersistentGlow('btn-api-reserve'); const reserveBtn = document.getElementById('btn-api-reserve');
        if (reserveBtn) { reserveBtn.disabled = true; reserveBtn.style.opacity = '0.7'; reserveBtn.style.transform = 'translateY(2px)'; reserveBtn.innerHTML = '⏳ BOOKING...'; }
        updateLiveDetails('status', 'API: Booking Slot...'); addLog(`🚀 [Script] Firing Reserve Slot API...`, "warning");

        let tokenToUse = solvedCaptchaToken;

        try {
            const res = await fetch("https://api.ivacbd.com/iams/api/v1/slots/reserveSlot", { method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/json", "Authorization": "Bearer " + rawToken }, body: JSON.stringify({ captchaToken: tokenToUse }) });
            const data = await res.json().catch(()=>({}));

            if (res.ok && (data.successFlag === true || data.status === "OK" || data.status === "OK_EXISTING" || data.status === "OK_NEW" || data.reservationId)) {

                clearCaptchaCache("Consumed for successful Booking");

                let paymentAmt = 1500;
                try { const payRes = await fetch("https://api.ivacbd.com/iams/api/v1/file/payment-amount", { method: "GET", headers: { "Accept": "application/json, text/plain, */*", "Authorization": "Bearer " + rawToken } }); const payData = await payRes.json().catch(()=>({})); if (payRes.ok && payData.successFlag && payData.data) { paymentAmt = payData.data; addLog(`💰 [API] Payment Fetched: ${paymentAmt} BDT`, "success"); } } catch(e) {}
                if (data.reservationId) {
                    localStorage.setItem('reservationId', data.reservationId); sessionStorage.setItem('reservationId', data.reservationId); if(data.appointmentDate) sessionStorage.setItem('appointmentDate', data.appointmentDate); sessionStorage.setItem('paymentAmount', paymentAmt);
                    try { let storageKeys = Object.keys(localStorage); for(let key of storageKeys) { if(key.includes('storage')) { let parsed = JSON.parse(localStorage.getItem(key)); if(parsed && parsed.state) { parsed.state.reservationId = data.reservationId; if(data.appointmentDate) parsed.state.appointmentDate = data.appointmentDate; parsed.state.paymentAmount = paymentAmt; parsed.state.amount = paymentAmt; localStorage.setItem(key, JSON.stringify(parsed)); } } } } catch(e) {}
                }
                updateLiveDetails('status', 'BOOKED! See Popup.'); addLog("✅ [API] BOOKING SUCCESS! Slot is secured.", "success"); showToast("Success", "Slot Booked Successfully!", "success");
                automationActive = false; sessionStorage.setItem('ivac_auto_active', 'false'); let autoBtn = document.getElementById('btn-toggle-auto'); if (autoBtn) { autoBtn.innerText = "▶ RESUME ALL"; autoBtn.className = "btn-glossy g-green"; }
                showSuccessPopup(data.reservationId);
            } else if (res.status === 503 || data.statusCode === 503) {
                if (!automationActive) { return; }
                retryScheduled = true;
                let delay = fastHitActive ? (Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000) : (Math.floor(Math.random() * (5000 - 3000 + 1)) + 3000);
                updateLiveDetails('status', `503 Busy - Delay ${(delay/1000).toFixed(1)}s`);
                addLog(`⚠️ 503 Server Busy. ${fastHitActive ? '[FAST]' : '[NORMAL]'} Retrying in ${(delay/1000).toFixed(1)}s...`, "warning");
                setTimeout(() => { isReservingApi = false; fireReserveSlotAPI(solvedCaptchaToken, isManual); }, delay);
            } else {
                let errorStr = JSON.stringify(data).toLowerCase();
                if (errorStr.includes('captcha verification failed') || errorStr.includes('invalid captcha') || errorStr.includes('captcha expired') || errorStr.includes('captcha')) {
                    clearCaptchaCache("Captcha Rejected by Server");
                    updateLiveDetails('status', 'Captcha Rejected - Re-solving'); showToast("Error", "Captcha Failed! Auto re-solving...", "error"); return;
                }
                if (!automationActive) { return; }
                retryScheduled = true;
                let delay = fastHitActive ? (Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000) : (Math.floor(Math.random() * (5000 - 3000 + 1)) + 3000);
                updateLiveDetails('status', `Failed - Retry ${(delay/1000).toFixed(1)}s`);
                addLog(`⚠️ Booking Failed. ${fastHitActive ? '[FAST]' : '[NORMAL]'} Retrying in ${(delay/1000).toFixed(1)}s...`, "warning");
                setTimeout(() => { isReservingApi = false; fireReserveSlotAPI(solvedCaptchaToken, isManual); }, delay);
            }
        } catch (e) {
            updateLiveDetails('status', 'Network Error');
            if (!automationActive) { return; }
            retryScheduled = true;
            let delay = fastHitActive ? (Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000) : (Math.floor(Math.random() * (5000 - 3000 + 1)) + 3000);
            addLog(`⚠️ Network/Connection Error. ${fastHitActive ? '[FAST]' : '[NORMAL]'} Retrying in ${(delay/1000).toFixed(1)}s...`, "warning");
            setTimeout(() => { isReservingApi = false; fireReserveSlotAPI(solvedCaptchaToken, isManual); }, delay);
        } finally {
            if (!retryScheduled) {
                isReservingApi = false;
            }
            if (reserveBtn && !reserveBtn.innerHTML.includes('BOOKED')) { reserveBtn.disabled = false; reserveBtn.style.opacity = '1'; reserveBtn.style.transform = ''; reserveBtn.innerHTML = "CONTINUE BOOKING"; }
        }
    }

    window.addEventListener('paste', (e) => {
        if (!automationActive) return;
        let pasteData = (e.clipboardData || window.clipboardData).getData('text');
        if (!pasteData) return;
        let code = pasteData.replace(/[^0-9]/g, '');
        if (code.length >= 6 && code.length <= 7) {
            let otpInput = document.getElementById('ui-otp');
            if (otpInput && otpInput.value !== code) {
                e.preventDefault();
                otpInput.value = code; lastPastedOTP = code;
                if (currentRequestId && !isVerifyingOtp) {
                    addLog(`📋 Auto-detected OTP [${code}] from Paste! Verifying...`, "info");
                    pureApiVerifyOTP();
                }
            }
        }
    });

    window.addEventListener('focus', async () => {
        if (!automationActive || !document.hasFocus() || !document.getElementById('ui-otp') || isVerifyingOtp) return;
        try {
            let clipText = await navigator.clipboard.readText(); clipText = clipText.replace(/[^0-9]/g, '');
            if (clipText.length >= 6 && clipText.length <= 7 && clipText !== lastPastedOTP) {
                let otpInput = document.getElementById('ui-otp');
                if (otpInput && otpInput.value !== clipText) {
                    otpInput.value = clipText; lastPastedOTP = clipText;
                    if (currentRequestId) { addLog(`📋 Auto-detected OTP [${clipText}] from Clipboard! Verifying...`, "info"); pureApiVerifyOTP(); }
                }
            }
        } catch(e) {}
    });

    function renderApp() {
        if (document.getElementById('ivac-hybrid-panel')) return;
        const panel = document.createElement('div'); panel.id = 'ivac-hybrid-panel';
        panel.innerHTML = `
            <div class="ui-header"><div style="display:flex; align-items:center;"><span id="token-dot" class="dot"></span><span style="letter-spacing: 0.5px;">SMARTIT IVAC_2.0 <sup style="color: #fde047; font-weight: 900;">@S</sup></span></div><button id="close-btn" title="Close Panel">✖</button></div>
            <div class="ui-body">
                <div style="display: flex; gap: 8px; margin-bottom: 6px; flex-shrink: 0; align-items: center;"><input type="text" id="ui-phone" class="ui-input-small" value="${SETTINGS.phone}" placeholder="Phone"><input type="password" id="ui-pass" class="ui-input-small" value="${SETTINGS.pass}" placeholder="Password"></div>
                <div style="display: flex; gap: 8px; margin-bottom: 10px; flex-shrink: 0; align-items: center;"><input type="text" id="ui-capsolver" class="ui-input-small" style="flex: 3; border-color: #8b5cf6;" value="${SETTINGS.capKey}" placeholder="CapSolver API Key"><button class="ui-btn btn-blue" id="btn-save-creds" style="margin:0; padding:10px 8px; flex: 1; font-size: 11px; min-width: 60px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s;">💾 SAVE</button></div>
                <div id="live-details-box">
                    <div style="display: flex; justify-content: center; align-items: center; margin-bottom: 14px; width: 100%;"><span id="detail-bd-time" style="background:#111827; color:#00e5ff; font-size:26px; font-weight:900; padding:8px 24px; border-radius:12px; border:1px solid rgba(0,229,255,0.4); text-shadow:0 0 10px rgba(0,229,255,0.9), 0 0 20px rgba(0,229,255,0.5); box-shadow:inset 0 4px 8px rgba(0,0,0,0.7), 0 0 15px rgba(0,229,255,0.3); font-family:'Fira Code', monospace; letter-spacing:2px; line-height:1; display:inline-block; text-align:center;">Loading...</span></div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; border-top: 1px dashed rgba(16,185,129,0.2); padding-top: 10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; min-width:0;"><span style="font-weight:600; opacity:0.8; font-size:11px; margin-right:4px; white-space:nowrap;">Auth:</span><span class="detail-value" id="detail-auth" style="color:#dc2626;">Inactive</span></div>
                        <div style="display:flex; justify-content:space-between; align-items:center; min-width:0;"><span style="font-weight:600; opacity:0.8; font-size:11px; margin-right:4px; white-space:nowrap;">Hits:</span><span class="detail-value" id="detail-api-hits" style="color:#8b5cf6;">${apiHitCount}</span></div>
                        <div style="display:flex; justify-content:space-between; align-items:center; min-width:0;"><span style="font-weight:600; opacity:0.8; font-size:11px; margin-right:4px; white-space:nowrap;">Status:</span><span class="detail-value" id="detail-status">Idle</span></div>
                        <div style="display:flex; justify-content:space-between; align-items:center; min-width:0;"><span style="font-weight:600; opacity:0.8; font-size:11px; margin-right:4px; white-space:nowrap;">Slots:</span><span class="detail-value" id="detail-slots" style="color:#dc2626;">Scan...</span></div>
                        <div style="display:flex; justify-content:space-between; align-items:center; min-width:0;"><span style="font-weight:600; opacity:0.8; font-size:11px; margin-right:4px; white-space:nowrap;">Date:</span><span class="detail-value" id="detail-date" style="color:#d97706;">Scan...</span></div>
                        <div style="display:flex; justify-content:space-between; align-items:center; min-width:0;"><span style="font-weight:600; opacity:0.8; font-size:11px; margin-right:4px; white-space:nowrap;">Time:</span><span class="detail-value" id="detail-time" style="color:#d97706;">Scan...</span></div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-start; border-top: 1px dashed rgba(16,185,129,0.2); padding-top: 8px; margin-top: 8px;"><span style="font-weight:600; opacity:0.8; margin-bottom: 4px; color: #b91c1c; font-size:11px;">Server Reply:</span><div id="detail-response" style="color:#991b1b; white-space: pre-wrap; word-break: break-word; overflow-y: auto; max-height: 80px; width: 100%; text-align: left; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 6px 8px; font-size: 12px; font-weight: 700; font-family: 'Inter', sans-serif; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05); cursor: text;">${lastServerReply}</div></div>
                </div>
                <div class="log-header"><span style="font-size:11px; font-weight:700; color:#64748b; letter-spacing:0.5px;">LIVE LOG (NETWORK PREVIEW):</span><span id="btn-clear-log">🧹 CLEAR</span></div>
                <div id="live-log">${savedLiveLogs || 'SMARTIT IVAC_2.0: System Ready! JSON Preview Active!'}</div>
                <button class="btn-glossy g-blue" id="btn-force-signin" data-orig-text="SIGN IN">SIGN IN</button>
                <input type="text" id="ui-otp" class="ui-input-otp" placeholder="PASTE OTP HERE" maxlength="7" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
                <button class="btn-glossy g-green" id="btn-verify" data-orig-text="VERIFY OTP">VERIFY OTP</button>
                <button class="btn-glossy g-purple" id="btn-api-reserve" data-orig-text="CONTINUE BOOKING">CONTINUE BOOKING</button>
                <div style="display: flex; gap: 10px; margin-top: 12px; flex-shrink: 0;">
                    <button class="btn-glossy ${fastHitActive ? 'g-cyan' : 'g-green'}" id="btn-toggle-fast" style="margin:0; padding:10px 12px; flex: 1; font-size: 11px;">${fastHitActive ? '⏸ FAST' : '▶ FAST'}</button>
                    <button class="btn-glossy ${automationActive ? 'g-red' : 'g-green'}" id="btn-toggle-auto" style="margin:0; padding:10px 12px; flex: 1; font-size: 11px;">${automationActive ? '🛑 STOP ALL' : '▶ RESUME ALL'}</button>
                </div>
                <div style="text-align:center; margin-top: 10px; font-size: 10px; font-weight: bold; color: #64748b; letter-spacing: 1px;">© SMARTIT <span style="color:#10b981;">@S</span> | MD YEASIR SHARAFAT</div>
            </div>
        `;
        document.body.appendChild(panel);
        if (savedPanelState.w) panel.style.width = savedPanelState.w; if (savedPanelState.h) panel.style.height = savedPanelState.h; if (savedPanelState.t) panel.style.top = savedPanelState.t; if (savedPanelState.l) { panel.style.left = savedPanelState.l; panel.style.right = 'auto'; }
        setupCustomResize(panel); setupDrag(panel);

        document.getElementById('close-btn').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); panel.style.display = 'none'; });
        document.getElementById('btn-clear-log').onclick = () => { document.getElementById('live-log').innerHTML = ''; sessionStorage.removeItem('ivac_live_logs'); apiHitCount = 0; sessionStorage.setItem('ivac_api_hits', 0); updateLiveDetails('api-hits', '0'); if (activeGlowBtnId) { let btn = document.getElementById(activeGlowBtnId); if (btn) btn.classList.remove('btn-highlight'); activeGlowBtnId = null; } addLog("Cleared.", "success"); };
        document.getElementById('btn-api-reserve').onclick = () => { let cToken = document.querySelector('[name="g-recaptcha-response"]')?.value || document.querySelector('input[name="captchaToken"]')?.value || ""; fireReserveSlotAPI(cToken, true); };
        document.getElementById('btn-save-creds').onclick = () => { const phone = document.getElementById('ui-phone').value.trim(); const pass = document.getElementById('ui-pass').value.trim(); const capKey = document.getElementById('ui-capsolver').value.trim(); if (phone && pass) { localStorage.setItem('ivac_phone', phone); localStorage.setItem('ivac_pass', pass); localStorage.setItem('ivac_capsolver_key', capKey); SETTINGS.phone = phone; SETTINGS.pass = pass; SETTINGS.capKey = capKey; addLog("💾 Credentials & CapSolver Key Saved!", "success"); } };
        document.getElementById('btn-force-signin').onclick = pureApiSignIn;
        document.getElementById('btn-toggle-fast').onclick = function() { fastHitActive = !fastHitActive; sessionStorage.setItem('ivac_fast_active', fastHitActive); this.innerText = fastHitActive ? "⏸ FAST" : "▶ FAST"; this.className = fastHitActive ? "btn-glossy g-cyan" : "btn-glossy g-green"; };
        document.getElementById('btn-toggle-auto').onclick = function() { automationActive = !automationActive; sessionStorage.setItem('ivac_auto_active', automationActive); if (!automationActive) { this.innerText = "▶ RESUME ALL"; this.className = "btn-glossy g-green"; updateLiveDetails('status', 'Stopped All'); addLog("🛑 STOP ALL activated. Auto-retries and hits disabled.", "warning"); clearTimeout(signInRetryTimeout); clearTimeout(otpRetryTimeout); isReservingApi = false; } else { this.innerText = "🛑 STOP ALL"; this.className = "btn-glossy g-red"; updateLiveDetails('status', 'Running'); addLog("▶ RESUME ALL activated.", "success"); } };
        document.getElementById('ui-otp').ondblclick = async function() { try { let clipText = await navigator.clipboard.readText(); clipText = clipText.replace(/[^0-9]/g, ''); if (clipText.length >= 6 && clipText.length <= 7) { this.value = clipText; lastPastedOTP = clipText; pureApiVerifyOTP(); } } catch(e) {} };
        document.getElementById('btn-verify').onclick = pureApiVerifyOTP;
        document.addEventListener('keydown', (e) => { if (e.key === 'F2') { e.preventDefault(); pureApiVerifyOTP(); } });

        document.getElementById('live-log').addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' && e.target.dataset.copy) {
                copyToClip(e.target.dataset.copy);
            }
        });

        checkAuthStatus(); updateLiveDetails('status', automationActive ? 'Running' : 'Stopped');
        setInterval(() => { const timeEl = document.getElementById('detail-bd-time'); if (timeEl) timeEl.innerText = getBDTime(); }, 1000);

        // Ensure clipboard polling runs constantly
        if (!clipboardInterval) clipboardInterval = setInterval(autoCheckClipboardForOTP, 1000);
    }

    function setReactInputValue(input, value) {
        if (!input || input.value === value) return; const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; nativeInputValueSetter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); input.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    const runEngine = () => {
        renderApp();
        if (!automationActive) return; checkAuthStatus(); const path = window.location.pathname;
        const phoneInput = document.querySelector('input[placeholder*="01"]') || document.querySelector('input[name="loginId"]') || document.querySelector('input[type="tel"]'); const passInput = document.querySelector('input[type="password"]');
        if (phoneInput || passInput) { const savedPhone = document.getElementById('ui-phone')?.value || SETTINGS.phone; const savedPass = document.getElementById('ui-pass')?.value || SETTINGS.pass; if (phoneInput && savedPhone) setReactInputValue(phoneInput, savedPhone); if (passInput && savedPass) setReactInputValue(passInput, savedPass); }
        if (path.includes('/signin') || path.includes('/verify-login-phone-otp')) return;
        document.querySelectorAll('svg.lucide-x').forEach(svg => { const btn = svg.closest('button'); if (btn && !btn.dataset.clicked && !btn.closest('#ivac-toast-container')) { const isToast = btn.closest('ol') || (btn.className && btn.className.includes('toast')); if (!isToast) { btn.dataset.clicked = "true"; btn.click(); addLog("🧹 Auto-closed a popup/toast", "info"); } } });

        if (path.includes('/time-slot')) {
            autoSelectDateTime();
            let cToken = globalCaptchaToken;
            let capKey = document.getElementById('ui-capsolver').value.trim();
            let hasValidCache = globalCaptchaToken && (Date.now() - globalCaptchaTimestamp < CAPTCHA_LIFETIME);

            if (hasValidCache || capKey) {
                fireReserveSlotAPI(cToken);
            } else {
                updateLiveDetails('status', 'Waiting for Captcha...');
            }
        } else {
            const apptBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes("Take Your Appointment") || b.innerText.includes("Take Appointment"));
            if (apptBtn && !apptBtn.disabled && !apptBtn.dataset.hit) { apptBtn.dataset.hit = "true"; setTimeout(() => { apptBtn.click(); setTimeout(() => delete apptBtn.dataset.hit, 2500); }, 300); }
        }
    };

    const unlockEverything = () => {
        const h = (e) => { if (e.target && typeof e.target.closest === 'function' && (e.target.closest('#ivac-hybrid-panel') || e.target.closest('#success-payment-popup') || e.target.closest('#ivac-toast-container'))) { return; } e.stopPropagation(); };
        ['contextmenu', 'copy', 'paste', 'selectstart'].forEach(v => { window.addEventListener(v, h, true); document.addEventListener(v, h, true); });
    };

    const init = () => { if (document.body) { unlockEverything(); renderApp(); setInterval(runEngine, SETTINGS.scanSpeed); } else { setTimeout(init, 100); } };
    init();
})();

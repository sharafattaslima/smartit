// ==UserScript==
// @name         Sharafat Loader Pro
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Secure Loader for Sharafat Script
// @match        *://*.ivacbd.com/* // IVAC-এর লিংক দেওয়া হলো
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      sharafat-backend.onrender.com
// ==/UserScript==

(function() {
    'use strict';

    // আপনার Render সার্ভারের লিংক
    const SERVER_URL = "https://sharafat-backend.onrender.com";

    // ফিঙ্গারপ্রিন্ট জেনারেটর (ইউজারের পিসি চেনার জন্য)
    function getFingerprint() {
        const data = navigator.userAgent + (navigator.hardwareConcurrency || '') + (navigator.deviceMemory || '') + Intl.DateTimeFormat().resolvedOptions().timeZone;
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            hash = Math.imul(31, hash) + data.charCodeAt(i) | 0;
        }
        return hash.toString(16);
    }

    const myFingerprint = getFingerprint();

    // লাইসেন্স কী নেওয়া
    function getLicense() {
        let key = GM_getValue("sharafat_license", "");
        if (!key) {
            key = prompt("Enter Sharafat Script License Key:");
            if (key) {
                key = key.trim();
                GM_setValue("sharafat_license", key);
            }
        }
        return key;
    }

    async function loadScript() {
        const license = getLicense();
        if (!license) return;

        // ১. সার্ভারে লাইসেন্স চেক করা
        GM_xmlhttpRequest({
            method: "POST",
            url: `${SERVER_URL}/api/license/authorize`,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({ licenseKey: license, fingerprint: myFingerprint }),
            onload: function(response) {
                if (response.status === 200) {
                    // ২. লাইসেন্স ঠিক থাকলে আসল কোড ডাউনলোড করা
                    fetchBundle(license);
                } else {
                    let msg = "License Check Failed!";
                    try {
                        msg = JSON.parse(response.responseText).message;
                    } catch(e) {}
                    alert(msg);
                    GM_setValue("sharafat_license", ""); // ভুল হলে মুছে দেওয়া
                }
            },
            onerror: function() {
                alert("Server is offline or unreachable.");
            }
        });
    }

    function fetchBundle(license) {
        GM_xmlhttpRequest({
            method: "POST",
            url: `${SERVER_URL}/api/bundle`,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({ licenseKey: license, fingerprint: myFingerprint }),
            onload: function(response) {
                if (response.status === 200) {
                    // ৩. আসল কোড ব্রাউজারে রান করা
                    try {
                        eval(response.responseText + "\n//# sourceURL=sharafat-core.js");
                    } catch(e) {
                        console.error("Script execution error:", e);
                    }
                } else {
                    alert("Bundle fetch failed. Access Denied.");
                }
            }
        });
    }

    // স্ক্রিপ্ট শুরু করা
    loadScript();

    // মেন্যু অপশন
    GM_registerMenuCommand("🔑 Change License Key", () => {
        GM_setValue("sharafat_license", "");
        loadScript();
    });

})();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// ক্লাউড হোস্টিং (Render) থেকে ডাটাবেস লিংকটি অটোমেটিক নেবে
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ Database Connected Successfully!"))
  .catch(err => console.error("❌ Database Connection Error:", err));

// ডাটাবেসের টেবিল বা স্কিমা তৈরি
const licenseSchema = new mongoose.Schema({
    key: String,
    maxDevices: { type: Number, default: 2 }, // ২ জনের লিমিট
    registeredDevices: [String],
    isActive: { type: Boolean, default: true }
});
const License = mongoose.model('License', licenseSchema);

// 🔒 আপনার আসল স্ক্রিপ্টের কোড এখানে থাকবে
const SHARAFAT_RAW_SCRIPT = `
    console.log("✅ Sharafat Pro Script Loaded Successfully!");
    
    // আপনার IVAC অটোমেশন, ফর্ম ফিলআপ বা আসল কাজের কোডগুলো 
    // হুবহু এখানে বসিয়ে দেবেন।
`;

// API ১: লাইসেন্স চেক এবং ডিভাইস রেজিস্টার করা
app.post('/api/license/authorize', async (req, res) => {
    const { licenseKey, fingerprint } = req.body;
    const license = await License.findOne({ key: licenseKey });

    if (!license) return res.status(403).json({ ok: false, message: "❌ Invalid license key" });
    if (!license.isActive) return res.status(403).json({ ok: false, message: "🚫 License revoked or expired" });

    // আগে থেকেই ডিভাইস রেজিস্টার করা থাকলে
    if (license.registeredDevices.includes(fingerprint)) {
        return res.json({ ok: true, message: "Browser approved." });
    }

    // নতুন ডিভাইস হলে এবং লিমিট খালি থাকলে (যেমন ২ জনের কম থাকলে)
    if (license.registeredDevices.length < license.maxDevices) {
        license.registeredDevices.push(fingerprint);
        await license.save(); // ডাটাবেসে সেভ করে রাখা
        return res.json({ ok: true, message: "New device registered." });
    }

    return res.status(403).json({ ok: false, message: "🔒 Device limit reached. Waiting for admin approval." });
});

// API ২: আসল কোড ব্রাউজারে পাঠানো
app.post('/api/bundle', async (req, res) => {
    const { licenseKey, fingerprint } = req.body;
    const license = await License.findOne({ key: licenseKey });

    if (license && license.isActive && license.registeredDevices.includes(fingerprint)) {
        res.type('text/plain').send(SHARAFAT_RAW_SCRIPT);
    } else {
        res.status(403).send("Unauthorized Access");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`Server is running on port \${PORT}\`));
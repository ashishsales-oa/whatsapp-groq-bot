const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { Groq } = require('groq-sdk');
const pino = require('pino');
const express = require('express');

const app = express();
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const groq = new Groq({ apiKey: GROQ_API_KEY });

async function connectToWhatsApp() {
    // सेशन डेटा सुरक्षित रखने के लिए फोल्डर
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    // व्हाट्सएप सॉकेट कनेक्शन सेटिंग्स (धीमे नेटवर्क को संभालने के लिए)
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        connectTimeoutMs: 60000, 
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 30000
    });

    sock.ev.on('creds.update', saveCreds);

    // कनेक्शन स्टेटस पर नजर रखने के लिए
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // जब स्क्रीन पर QR कोड प्रिंट करना हो
        if (qr) {
            console.log('\n==================================================');
            console.log('📲 कृपया नीचे दिए गए QR कोड को स्कैन करें:');
            console.log('==================================================\n');
            qrcode.generate(qr, { small: true });
        }
        
        // अगर कनेक्शन बंद हो जाए
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            // धड़ाधड़ रीस्टार्ट होने के बजाय 5 सेकंड का ब्रेक लें
            if (shouldReconnect) {
                console.log(`⚠️ कनेक्शन टूटा (Reason: ${statusCode})। 5 सेकंड में दोबारा प्रयास कर रहे हैं...`);
                setTimeout(() => connectToWhatsApp(), 5000);
            } else {
                console.log('❌ आप व्हाट्सएप से लॉगआउट हो चुके हैं। कृपया दोबारा स्कैन करें।');
            }
        } else if (connection === 'open') {
            console.log('\n🚀 सफलता! आपका पर्सनल व्हाट्सएप AI बोट अब एक्टिव और लाइव है!\n');
        }
    });

    // जब आपके नंबर पर कोई नया मैसेज आए
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return; // खुद के भेजे मैसेज इग्नोर करें

        const fromNumber = msg.key.remoteJid;
        if (fromNumber.includes('@g.us')) return; // ग्रुप के मैसेज इग्नोर करें

        // मैसेज का टेक्स्ट निकालना
        const msgText = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!msgText) return;

        console.log(`नया मैसेज आया: "${msgText}" | भेजने वाला: ${fromNumber}`);

        try {
            // Groq AI (Llama 3.3) से जवाब मांगना
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { 
                        role: "system", 
                        content: "तुम मेरे पर्सनल व्हाट्सएप असिस्टेंट हो। जब लोग मुझे मैसेज करें, तो मेरी तरफ से बहुत ही विनम्रता, शॉर्ट और दोस्ताना अंदाज़ में हिंदी या हिंग्लिश में जवाब do। बातचीत में इमोजी का उपयोग करो।" 
                    },
                    { role: "user", content: msgText }
                ],
                model: "llama-3.3-70b-versatile",
            });

            const aiReply = chatCompletion.choices[0].message.content;

            // सामने वाले को आपकी तरफ से रिप्लाई भेजना
            await sock.sendMessage(fromNumber, { text: aiReply }, { quoted: msg });
            console.log(`✅ AI ने जवाब भेज दिया: "${aiReply}"`);

        } catch (error) {
            console.error('❌ Groq AI एरर:', error.message);
        }
    });
}

// बोट की शुरुआत करें
connectToWhatsApp();

// Render सर्वर को एक्टिव रखने के लिए डमी रूट
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Superfast Bot is running!'));
app.listen(PORT, () => console.log(`Dummy server running on port ${PORT}`));

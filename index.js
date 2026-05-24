const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { Groq } = require('groq-sdk');
const pino = require('pino');
const express = require('express');

const app = express();
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const groq = new Groq({ apiKey: GROQ_API_KEY });

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        connectTimeoutMs: 60000, // सर्वर को कनेक्ट होने के लिए 60 सेकंड का समय दें
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 30000
    });

    sock.ev.on('creds.update', saveCreds);

    // जब कनेक्शन स्टेटस बदले
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n=== 📲 कृपया नीचे दिए गए QR कोड को स्कैन करें ===\n');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('कनेक्शन बंद हुआ। दोबारा जोड़ने की कोशिश...', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('🚀 आपका पर्सनल व्हाट्सएप AI बोट अब एक्टिव और लाइव है!');
        }
    });

    // जब कोई नया मैसेज आए
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return; // खुद के मैसेज इग्नोर करें

        const fromNumber = msg.key.remoteJid;
        if (fromNumber.includes('@g.us')) return; // ग्रुप मैसेज इग्नोर करें

        const msgText = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!msgText) return;

        console.log(`नया मैसेज आया: "${msgText}" | भेजने वाला: ${fromNumber}`);

        try {
            // Groq AI से जवाब लें
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { 
                        role: "system", 
                        content: "तुम मेरे पर्सनल व्हाट्सएप असिस्टेंट हो। जब लोग मुझे मैसेज करें, तो मेरी तरफ से बहुत ही विनम्रता, शॉर्ट और दोस्ताना अंदाज़ में हिंदी या हिंग्लिश में जवाब दो। बातचीत में इमोजी का उपयोग करो।" 
                    },
                    { role: "user", content: msgText }
                ],
                model: "llama-3.3-70b-versatile",
            });

            const aiReply = chatCompletion.choices[0].message.content;

            // रिप्लाई भेजें
            await sock.sendMessage(fromNumber, { text: aiReply }, { quoted: msg });
            console.log(`✅ AI ने जवाब भेज दिया: "${aiReply}"`);

        } catch (error) {
            console.error('❌ Groq AI एरर:', error.message);
        }
    });
}

// बोट चालू करें
connectToWhatsApp();

// Render के लिए डमी सर्वर
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Fast Bot is running!'));
app.listen(PORT, () => console.log(`Dummy server running on port ${PORT}`));

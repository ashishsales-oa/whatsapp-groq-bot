const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { Groq } = require('groq-sdk');
const express = require('express');

const app = express();
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const groq = new Groq({ apiKey: GROQ_API_KEY });

// व्हाट्सएप क्लाइंट सेटअप (बिना सैंडबॉक्स एरर के चलाने के लिए)
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process'
        ]
    }
});

// जब QR Code जनरेट हो, तो उसे Render के Logs में प्रिंट करो
client.on('qr', (qr) => {
    console.log('\n=== कृपया नीचे दिए गए QR कोड को अपने व्हाट्सएप से स्कैन करें ===\n');
    qrcode.generate(qr, { small: true });
});

// जब बोट सफलतापूर्वक लॉगिन हो जाए
client.on('ready', () => {
    console.log('🚀 आपका पर्सनल व्हाट्सएप AI बोट अब पूरी तरह एक्टिव और लाइव है!');
});

// जब आपके नंबर पर कोई नया मैसेज आए
client.on('message', async (msg) => {
    // स्वयं के द्वारा भेजे गए मैसेजेस या ग्रुप मैसेजेस को इग्नोर करने के लिए
    if (msg.fromMe || msg.from.includes('@g.us')) return;

    console.log(`नया मैसेज आया: "${msg.body}" | भेजने वाला: ${msg.from}`);

    try {
        // Groq AI से जवाब मांगना
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: "तुम मेरे पर्सनल व्हाट्सएप असिस्टेंट हो। जब लोग मुझे मैसेज करें, तो मेरी तरफ से बहुत ही विनम्रता, शॉर्ट और दोस्ताना अंदाज़ में हिंदी या हिंग्लिश में जवाब दो। बातचीत में इमोजी का उपयोग करो।" 
                },
                { role: "user", content: msg.body }
            ],
            model: "llama-3.3-70b-versatile",
        });

        const aiReply = chatCompletion.choices[0].message.content;
        
        // सामने वाले को आपकी तरफ से रिप्लाई भेजना
        await msg.reply(aiReply);
        console.log(`✅ AI ने जवाब भेज दिया: "${aiReply}"`);

    } catch (error) {
        console.error('❌ Groq AI एरर:', error.message);
    }
});

// क्लाइंट शुरू करें
client.initialize();

// Render को जिंदा रखने के लिए एक छोटा सा डमी पोर्ट सर्वर
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Personal Bot is running!'));
app.listen(PORT, () => console.log(`Dummy server running on port ${PORT}`));

const express = require('express');
const axios = require('axios');
const { Groq } = require('groq-sdk');

const app = express();
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "my_secret_token_123"; 

const groq = new Groq({ apiKey: GROQ_API_KEY });

app.get('/webhook', (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    
    // 🔍 जासूस लॉग: यह देखने के लिए कि क्या फेसबुक हमें कुछ भेज भी रहा है या नहीं
    console.log("=== नया मैसेज आया है ===");
    console.log(JSON.stringify(body, null, 2));
    
    if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
        const message = body.entry[0].changes[0].value.messages[0];
        const fromNumber = message.from; 
        
        if (message.type === 'text') {
            const msgText = message.text.body;
            console.log(`मैसेज का टेक्स्ट है: "${msgText}" | भेजने वाले का नंबर: ${fromNumber}`);

            try {
                console.log("Groq AI को कॉल किया जा रहा है...");
                const chatCompletion = await groq.chat.completions.create({
                    messages: [
                        { 
                            role: "system", 
                            content: "तुम एक बेहद मददगार और दोस्ताना WhatsApp बिज़नेस असिस्टेंट हो। ग्राहकों को हिंदी या हिंग्लिश में छोटे, सटीक और 2-3 वाक्यों में जवाब दो। बातचीत में सही जगह इमोजी का इस्तेमाल करो।" 
                        },
                        { role: "user", content: msgText }
                    ],
                    model: "llama-3.3-70b-versatile", 
                });
                
                const aiReply = chatCompletion.choices[0].message.content;
                console.log(`Groq AI का जवाब तैयार है: "${aiReply}"`);

                console.log("अब इस जवाब को वापस व्हाट्सएप पर भेजा जा रहा है...");
                const whatsappResponse = await axios({
                    method: 'POST',
                    url: `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
                    headers: { 
                        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    data: {
                        messaging_product: "whatsapp",
                        to: fromNumber,
                        type: "text",
                        text: { body: aiReply }
                    }
                });

                console.log("✅ बधाई हो! जवाब सफलतापूर्वक चला गया। फेसबुक का रिस्पॉन्स:", whatsappResponse.data);

            } catch (error) {
                console.error("❌ गड़बड़ हो गई! एरर की पूरी डिटेल नीचे है:");
                if (error.response) {
                    console.error("फेसबुक या Groq से आया असली एरर:", JSON.stringify(error.response.data, null, 2));
                } else {
                    console.error(error.message);
                }
            }
        }
    } else {
        console.log("वेबहुक हिट तो हुआ, लेकिन यह किसी यूजर का नया टेक्स्ट मैसेज नहीं है।");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

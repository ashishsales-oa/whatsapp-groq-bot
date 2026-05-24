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
    
    if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
        const message = body.entry[0].changes[0].value.messages[0];
        const fromNumber = message.from; 
        
        if (message.type === 'text') {
            const msgText = message.text.body;

            try {
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

                await axios({
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

                console.log(`Reply sent to ${fromNumber}`);

            } catch (error) {
                console.error("Error processing message:", error.response ? error.response.data : error.message);
            }
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

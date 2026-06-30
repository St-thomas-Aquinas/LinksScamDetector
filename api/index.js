const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();

// ⚠️ Groq API Key - now read from Vercel Environment Variables
const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

// 🌐 Web Scraping Function
async function scrapeWebsiteText(url) {
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36' },
            timeout: 15000,
            maxRedirects: 5
        });
        const $ = cheerio.load(response.data);
        $('script, style, nav, footer, header, iframe, noscript').remove();
        let cleanText = $('body').text().replace(/\s+/g, ' ').trim();
        if (cleanText.length > 12000) cleanText = cleanText.substring(0, 12000) + " [Content truncated]";
        return cleanText;
    } catch (error) {
        console.error(`❌ Failed to scrape ${url}:`, error.message);
        return null;
    }
}

// 🤖 AI Analysis Function
async function analyzeContentForScam(content, originalUrl, type = "text") {
    if (!GROQ_API_KEY) {
        return "⚠️ Groq API Key is missing. Please configure GROQ_API_KEY in Vercel environment variables.";
    }
    try {
        const systemPrompt = `You are an expert cybersecurity AI operating in Kenya. Analyze the provided content for scams, phishing, or fraud. Look for red flags: fake government branding (IEBC, KRA, NTSA, HELB), requests for M-Pesa/application fees for jobs, suspicious domains, poor grammar, or fake tenders. Give a definitive, concise verdict on whether it is a SCAM or LEGITIMATE. Format clearly with bullet points.`;
        const userPrompt = type === "website"
            ? `Analyze this website: ${originalUrl}\n\nWEBSITE CONTENT:\n${content}`
            : `Analyze this pasted message/text for scams: ${content}`;

        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
            temperature: 0.2,
            max_tokens: 400
        }, { headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" } });

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error("❌ Groq API Error:", error.response?.data || error.message);
        return "⚠️ AI analysis failed due to an API error.";
    }
}

// 🌐 API Endpoint
app.post('/analyze', async (req, res) => {
    const { content } = req.body;
    if (!content || content.trim().length < 5) {
        return res.status(400).json({ error: "Please paste a valid URL or text message." });
    }

    let finalAnalysis = "";
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = content.match(urlRegex);

    if (urls && urls.length > 0) {
        const targetUrl = urls[0];
        const websiteText = await scrapeWebsiteText(targetUrl);

        if (websiteText && websiteText.length > 50) {
            finalAnalysis = await analyzeContentForScam(websiteText, targetUrl, "website");
        } else {
            finalAnalysis = await analyzeContentForScam(content, targetUrl, "text");
            finalAnalysis += "\n\n_(Note: I couldn't open the website directly, so I analyzed the pasted text.)_";
        }
    } else {
        finalAnalysis = await analyzeContentForScam(content, "N/A", "text");
    }

    res.json({ result: finalAnalysis });
});

// Fallback: serve index.html for any unmatched route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ✅ Export for Vercel serverless (instead of app.listen)
module.exports = app;

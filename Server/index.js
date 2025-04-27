import express from 'express';
import { AzureChatOpenAI } from "@langchain/openai";
import cors from 'cors';
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { AzureOpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import {RecursiveCharacterTextSplitter} from "@langchain/textsplitters";
import {PDFLoader} from "@langchain/community/document_loaders/fs/pdf";
import {FaissStore} from "@langchain/community/vectorstores/faiss";
import * as cheerio from 'cheerio';


let vectorStore

const embeddings = new AzureOpenAIEmbeddings({
    temperature: 0,
    azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_EMBEDDING_DEPLOYMENT_NAME
});
// const loader = new PDFLoader("./public/guitar.pdf");
// const docs = await loader.load();
// const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
// const splitDocs = await textSplitter.splitDocuments(docs);
// console.log(`Document split into ${splitDocs.length} chunks. Now saving into vector store`);
// vectorStore = await FaissStore.fromDocuments(splitDocs, embeddings);
// await vectorStore.save("./vectordatabase"); // geef hier de naam van de directory waar je de data gaat opslaan

vectorStore = await FaissStore.load("./vectordatabase", embeddings); // dezelfde naam van de directory
const model = new AzureChatOpenAI({
    temperature: 0.5,
    verbose: false,
    streaming: true,
});
const port = 8000;
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(cors());


app.get('/', (req, res) => {
    res.send('Hello world!');
    console.log(process.env.AZURE_OPENAI_API_KEY)

});


import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();
app.use(express.json());

app.post('/spotify-token', async (req, res) => {
    const credentials = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${encodedCredentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });

        const data = await response.json();
        res.json({ access_token: data.access_token });
    } catch (error) {
        console.error(error);
        res.status(500).send('Spotify token ophalen mislukt');
    }
});



async function searchGeniusLyrics(songTitle) {
    const response = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(songTitle)}`, {
        headers: {
            'Authorization': `Bearer ${process.env.GENIUS_ACCESS_TOKEN}`
        }
    });
    const data = await response.json();
    if (data.response.hits.length > 0) {
        const songPath = data.response.hits[0].result.path;
        const songUrl = `https://genius.com${songPath}`;

        // Fetch de lyrics HTML pagina
        const pageResponse = await fetch(songUrl);
        const pageHtml = await pageResponse.text();

        // Parse de pagina met cheerio
        const $ = cheerio.load(pageHtml);
        let lyrics = '';

        $('div[data-lyrics-container="true"]').each((i, elem) => {
            lyrics += $(elem).text().trim() + '\n';
        });

        return {
            url: songUrl,
            lyrics: lyrics || null // als lyrics niet gevonden zijn
        };
    } else {
        return null;
    }
}



app.use(express.json()); // Zorg dat JSON-bodies gelezen kunnen worden



app.post('/chat', async (req, res) => {
    const { history, prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Geen prompt meegegeven.' });
    }

    let lyricsInfo = null;
    if (prompt.toLowerCase().includes('lyrics') || prompt.toLowerCase().includes('songtekst')) {
        lyricsInfo = await searchGeniusLyrics(prompt);
    }

    const relevantDocs = await vectorStore.similaritySearch(`kijk of je informatie kan vinden op deze vraag ${prompt} en vat dit samen`, 3);
    const context = relevantDocs.map(doc => doc.pageContent).join("\n\n");

    let truncatedLyrics = lyricsInfo?.lyrics ? lyricsInfo.lyrics.slice(0, 500) + "..." : "Geen lyrics gevonden.";

    let system = `Je bent een goede Gitaar Docent die altijd iedereen wilt helpen met het leren van Gitaar.
Als je een nummer gaat uitleggen zet dan de akkoorden dik gedrukt.
Als je de akkoorden van een nummer opnoemt zet ze dan in structuur zoals dit: intro: (akkoord) (akkoord) enz. (enter) couplet (akkoord) (akkoord) enz. (enter) refrein (akkoord) (akkoord) enz.
Gebruik deze context: ${context} om antwoord te geven op de vraag.
Gebruik deze songteksten: ${truncatedLyrics} om alleen het refrein uit te leggen.
Als je songteksten krijgt aangeleverd, verwerk ze dan netjes in je uitleg.
Als je een nummer noemt zet dan de titel tussen haakjes.
Noem altijd de titel van het nummer maar 1 keer in je antwoord.
Zet de naam van een artiest altijd tussen haakjes.`;


    const messages = [
        new SystemMessage(system),
    ];

    if (Array.isArray(history)) {
        history.forEach(msg => {
            if (msg.sender === 'user') {
                messages.push(new HumanMessage(msg.text));
            } else if (msg.sender === 'bot') {
                messages.push(new AIMessage(msg.text));
            }
        });
    }

    const userMessage = lyricsInfo ? `${prompt}\n\nHier zijn de lyrics van het nummer:\n\n${lyricsInfo.lyrics || 'Geen lyrics gevonden.'}\n\nSong URL: ${lyricsInfo.url}` : prompt;
    messages.push(new HumanMessage(userMessage));

    try {
        const stream = await model.stream(messages);
        for await (const chunk of stream) {
            await new Promise(resolve => setTimeout(resolve, 100))
            res.write(chunk.content);
        }
        res.end();
    } catch (error) {
        console.error('Fout bij AI-aanroep:', error);
        res.status(500).json({ error: 'Er ging iets mis bij het verwerken van je vraag.' });
    }
});







app.listen(port, () => {
    console.log("Server draait op http://localhost:8000");
});
import { useState } from 'react'
import './App.css'

function App() {
    const [prompt, setPrompt] = useState('')
    const [chatHistory, setChatHistory] = useState([]) // chatgeschiedenis
    const [response, setResponse] = useState("")
    const [enabled, setEnabled] = useState(true)
    const [spotifyTrack, setSpotifyTrack] = useState(null) // 🔥 nieuw: gevonden spotify nummer

    // Haal access token op bij Spotify
    async function getSpotifyAccessToken() {
        const response = await fetch('http://localhost:8000/spotify-token', {
            method: 'POST'
        });
        const data = await response.json();
        return data.access_token;
    }

    async function searchSpotifyTrack(query) {
        const token = await getSpotifyAccessToken();
        console.log(encodeURIComponent(query))
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        return data.tracks.items[0]; // Eerste nummer dat gevonden wordt
    }

    const sendPrompt = async () => {
        setResponse('')
        setChatHistory(prev => [...prev, { sender: 'user', text: prompt }])
        setEnabled(false)
        try {
            const res = await fetch('http://localhost:8000/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                },
                body: JSON.stringify({
                    history: chatHistory,
                    prompt: prompt,
                })
            })

            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullResponse = ''
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                fullResponse += chunk
                setResponse(prev => prev + chunk);
            }

            setChatHistory(prev => [...prev, { sender: 'bot', text: fullResponse }]);
            setPrompt(''); // Inputveld leegmaken

            if (
                fullResponse.toLowerCase().includes('nummer') ||
                fullResponse.toLowerCase().includes('lied') ||
                fullResponse.toLowerCase().includes('speel') ||
                fullResponse.toLowerCase().includes('spelen') ||
                fullResponse.toLowerCase().includes('song') ||
                fullResponse.toLowerCase().includes('tune') ||
                fullResponse.toLowerCase().includes('play') ||
                fullResponse.toLowerCase().includes('track')
            ) {
                const match = fullResponse.match(/"([^']+)"/);
                let searchTerm;
                if (match && match[1]) {
                    searchTerm = match[1]; // Tekst tussen quotes pakken

                }
                if (searchTerm) {
                    const foundTrack = await searchSpotifyTrack(searchTerm);

                    if (foundTrack) {
                        setSpotifyTrack(foundTrack);
                    } else {
                        setSpotifyTrack(null);
                    }
                }else {
                    setSpotifyTrack(null);
                }

            } else {
                setSpotifyTrack(null);
            }

        } catch (err) {
            console.error(err)
        } finally {
            setEnabled(true)
        }
    }

    return (
        <div className="p-4">
            <h1 className="text-3xl font-bold underline mb-4">
                Gitaar Teacher
            </h1>

            <label htmlFor="prompt" className="block mb-2">Je vraag:</label>
            <textarea
                id="prompt"
                rows="3"
                placeholder="Typ hier je vraag..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="border p-2 w-full mb-2"
            ></textarea>

            <button
                onClick={sendPrompt}
                className="bg-blue-500 text-white px-4 py-2 rounded mb-4 disabled:bg-gray-400 disabled:cursor-not-allowed"
                disabled={!enabled}
            >
                Verstuur
            </button>

            <div className="response space-y-2">
                <div className="bg-green-200 text-left p-2 rounded">
                    <strong>'Gitaarbot'</strong>
                    <p>{response}</p>
                </div>

                {spotifyTrack && (
                    <div className="mt-4">
                        <h2 className="text-xl font-bold mb-2">🎵 Gevonden nummer:</h2>
                        <p>{spotifyTrack.name} - {spotifyTrack.artists.map(artist => artist.name).join(', ')}</p>
                        <iframe
                            src={`https://open.spotify.com/embed/track/${spotifyTrack.id}`}
                            width="100%"
                            height="80"
                            frameBorder="0"
                            allow="encrypted-media"
                            className="rounded"
                        ></iframe>
                    </div>
                )}
            </div>

            <div className="response space-y-2 mt-4">
                {[...chatHistory]
                    .slice(0, -1) // laatste bericht eruit knippen
                    .reverse()
                    .map((msg, index) => (
                        <div key={index} className={`p-2 rounded ${msg.sender === 'user' ? 'bg-gray-200 text-right' : 'bg-green-200 text-left'}`}>
                            <strong>{msg.sender === 'user' ? 'Jij' : 'Gitaarbot'}:</strong> {msg.text}
                        </div>
                    ))}
            </div>

        </div>
    )
}

export default App

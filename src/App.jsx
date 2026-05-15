import React, { useState, useEffect, useRef } from 'react';
import {
  Video, VideoOff, Mic, MicOff, Send, PhoneOff,
  Users, MessageSquare, Heart, ThumbsUp, Laugh, Hand, X,
  Loader, AlertCircle, Camera,
} from 'lucide-react';
import { useFamilySync } from './hooks/useFamilySync';
import './index.css';

// ─── Video Tile ───────────────────────────────────────
const VideoTile = ({ stream, label, isLocal, muted }) => {
  const ref = useRef();
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream; }, [stream]);
  return (
    <div className="video-tile glass">
      <video ref={ref} autoPlay playsInline muted={isLocal || muted} />
      <div className="video-info">
        {isLocal ? <Video size={13} /> : <Users size={13} />}
        <span>{label}</span>
      </div>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────
export default function App() {
  const [name, setName] = useState('');
  const [room, setRoom] = useState('csaladi-kor');
  const [session, setSession] = useState(null);

  const [localStream, setLocalStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [cameraLoading, setCameraLoading] = useState(false);

  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVidOff, setIsVidOff] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const chatRef = useRef();

  const { remoteStreams, messages, reactions, peerStatus, peerNames, sendMessage, sendReaction }
    = useFamilySync(session?.room ?? null, session?.name ?? null, localStream);

  useEffect(() => { chatRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (!session || localStream) return;
    setCameraLoading(true);
    setCameraError(null);
    navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    })
      .then(stream => { setLocalStream(stream); setCameraLoading(false); })
      .catch(err => {
        setCameraLoading(false);
        setCameraError('Kamera hozzáférés kell a híváshoz. Engedélyezd a böngészőben!');
      });
  }, [session]);

  useEffect(() => () => localStream?.getTracks().forEach(t => t.stop()), [localStream]);

  const toggleMute = () => {
    localStream?.getAudioTracks().forEach(t => (t.enabled = isMuted));
    setIsMuted(v => !v);
  };
  const toggleVid = () => {
    localStream?.getVideoTracks().forEach(t => (t.enabled = isVidOff));
    setIsVidOff(v => !v);
  };
  const handleSend = (e) => {
    e.preventDefault();
    if (inputText.trim()) { sendMessage(inputText.trim()); setInputText(''); }
  };

  if (!session) {
    return (
      <div className="join-screen">
        <form className="join-card glass" onSubmit={e => { e.preventDefault(); if (name.trim() && room.trim()) setSession({ name: name.trim(), room: room.trim() }); }}>
          <div className="join-logo"><Video size={38} /><span>FamilyConnect</span></div>
          <h1>Üdvözlünk!</h1>
          <p className="join-subtitle">Lépj be a közös szobába.</p>
          <input className="join-input" placeholder="A te neved" value={name} onChange={e => setName(e.target.value)} autoFocus required />
          <input className="join-input" placeholder="Szoba neve" value={room} onChange={e => setRoom(e.target.value)} required />
          <button type="submit" className="join-btn">Belépés</button>
        </form>
      </div>
    );
  }

  if (!localStream) {
    return (
      <div className="join-screen">
        <div className="join-card glass" style={{ textAlign: 'center' }}>
          {cameraLoading ? <Loader size={40} className="spin" /> : <AlertCircle size={40} color="#ef4444" />}
          <h2 style={{ marginTop: 20 }}>{cameraError ? 'Hiba' : 'Kamera indítása...'}</h2>
          <p style={{ marginTop: 10, color: 'var(--muted)' }}>{cameraError || 'Kérlek engedélyezd a kamerát a böngészőben.'}</p>
          {cameraError && <button className="join-btn" onClick={() => window.location.reload()}>Újra</button>}
        </div>
      </div>
    );
  }

  if (peerStatus === 'full') {
    return (
      <div className="join-screen">
        <div className="join-card glass" style={{ textAlign: 'center' }}>
          <AlertCircle size={40} color="#ef4444" />
          <h2 style={{ marginTop: 20 }}>A szoba megtelt</h2>
          <p style={{ marginTop: 10, color: 'var(--muted)' }}>Próbálkozz később vagy egy másik szobában.</p>
          <button className="join-btn" onClick={() => window.location.reload()}>Vissza</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header glass">
        <div className="logo"><Video size={22} /><span>FamilyConnect</span></div>
        <div className="header-right">
          <div className={`status-chip ${peerStatus === 'online' ? 'online' : 'connecting'}`}>
            {peerStatus === 'online' ? <><span className="dot" />Online</> : <><Loader size={12} className="spin" />Csatlakozás...</>}
          </div>
          <button className={`icon-btn ${showChat ? 'active' : ''}`} onClick={() => setShowChat(v => !v)}>
            <MessageSquare size={18} />
          </button>
        </div>
      </header>

      <div className="main-area">
        <div className={`video-grid participants-${1 + remoteStreams.length}`}>
          <VideoTile stream={localStream} label={`${session.name} (Te)`} isLocal muted={isMuted} />
          {remoteStreams.map(rs => (
            <VideoTile key={rs.id} stream={rs.stream} label={peerNames[rs.id] || 'Csatlakozó...'} />
          ))}
          {remoteStreams.length === 0 && peerStatus === 'online' && (
            <div className="waiting-overlay">
              <div className="waiting-content glass">
                <Loader size={24} className="spin" />
                <span>Várakozás a többiekre...</span>
                <p>Oszd meg a szoba nevét: <strong>{session.room}</strong></p>
              </div>
            </div>
          )}
        </div>

        {showChat && (
          <aside className="chat-panel glass">
            <div className="chat-header">
              <span>Csevegés</span>
              <button className="icon-btn" onClick={() => setShowChat(false)}><X size={18} /></button>
            </div>
            <div className="chat-messages">
              {messages.map(m => (
                <div key={m._id} className={`message ${m.sender === session.name ? 'sent' : 'received'}`}>
                  <div className="message-sender">{m.sender}</div>
                  <div className="message-text">{m.text}</div>
                </div>
              ))}
              <div ref={chatRef} />
            </div>
            <form className="chat-input-row" onSubmit={handleSend}>
              <input className="chat-input" placeholder="Üzenet..." value={inputText} onChange={e => setInputText(e.target.value)} />
              <button type="submit" className="send-btn" disabled={!inputText.trim()}><Send size={18} /></button>
            </form>
          </aside>
        )}
      </div>

      <div className="controls-bar glass">
        <button className={`ctrl-btn ${isMuted ? 'danger' : 'active'}`} onClick={toggleMute}>
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button className={`ctrl-btn ${isVidOff ? 'danger' : 'active'}`} onClick={toggleVid}>
          {isVidOff ? <VideoOff size={20} /> : <Video size={20} />}
        </button>
        <div className="ctrl-divider" />
        <button className="ctrl-btn emoji" onClick={() => sendReaction('❤️')}><Heart size={20} color="#fb7185" /></button>
        <button className="ctrl-btn emoji" onClick={() => sendReaction('👍')}><ThumbsUp size={20} color="#60a5fa" /></button>
        <button className="ctrl-btn emoji" onClick={() => sendReaction('😂')}><Laugh size={20} color="#fbbf24" /></button>
        <button className="ctrl-btn emoji" onClick={() => sendReaction('👋')}><Hand size={20} color="#c084fc" /></button>
        <div className="ctrl-divider" />
        <button className="ctrl-btn danger" onClick={() => window.location.reload()}><PhoneOff size={20} /></button>
      </div>

      {reactions.map(r => (
        <div key={r._id} className="emoji-burst" style={{ left: `${10 + Math.random() * 80}%`, bottom: 90 }}>
          {r.emoji}
        </div>
      ))}
    </div>
  );
}

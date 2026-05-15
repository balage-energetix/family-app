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
  // Step 1: form
  const [name, setName]   = useState('');
  const [room, setRoom]   = useState('csaladi-kor');
  const [session, setSession] = useState(null); // { name, room }

  // Step 2: camera
  const [localStream, setLocalStream]   = useState(null);
  const [cameraError, setCameraError]   = useState(null);
  const [cameraLoading, setCameraLoading] = useState(false);

  // Step 3: call UI
  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted]     = useState(false);
  const [isVidOff, setIsVidOff]   = useState(false);
  const [showChat, setShowChat]   = useState(false);
  const chatRef = useRef();

  const { remoteStreams, messages, reactions, peerStatus, mySlot, peerNames, sendMessage, sendReaction }
    = useFamilySync(session?.room ?? null, session?.name ?? null, localStream);

  // Auto-scroll chat
  useEffect(() => { chatRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Request camera when session starts
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
        setCameraError(
          err.name === 'NotAllowedError'
            ? 'Kamera/mikrofon hozzáférés megtagadva. Kattints a böngésző címsorában a kamera ikonra és engedélyezd, majd nyomj az "Újra" gombra!'
            : `Hiba: ${err.message || err.name}`
        );
      });
  }, [session]);

  // Cleanup on unmount
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

  // ── SCREEN 1: Join form ──────────────────────────────
  if (!session) {
    return (
      <div className="join-screen">
        <form className="join-card glass" onSubmit={e => { e.preventDefault(); if (name.trim() && room.trim()) setSession({ name: name.trim(), room: room.trim() }); }}>
          <div className="join-logo"><Video size={38} /><span>FamilyConnect</span></div>
          <h1>Üdvözlünk!</h1>
          <p className="join-subtitle">Lépj be a közös szobába és találkozz a családoddal.</p>
          <label className="input-label">A te neved</label>
          <input className="join-input" placeholder="pl. Balázs" value={name} onChange={e => setName(e.target.value)} autoFocus required />
          <label className="input-label">Szoba neve</label>
          <input className="join-input" placeholder="pl. csaladi-kor" value={room} onChange={e => setRoom(e.target.value)} required />
          <button type="submit" className="join-btn">Csatlakozás →</button>
          <p className="join-hint">Mindenki, aki ugyanezt a szobanevet írja be, automatikusan megjelenik nálad.</p>
        </form>
      </div>
    );
  }

  // ── SCREEN 2: Camera permission ──────────────────────
  if (!localStream) {
    return (
      <div className="join-screen">
        <div className="join-card glass" style={{ textAlign: 'center', gap: 0 }}>
          {cameraLoading && !cameraError && (
            <>
              <Camera size={52} color="#8b5cf6" style={{ margin: '0 auto 20px' }} />
              <h2>Kamera engedélyezése</h2>
              <p style={{ color: 'var(--muted)', marginTop: 12, lineHeight: 1.6 }}>
                A böngésző kéri a kamera és mikrofon hozzáférést.<br />
                <strong>Kattints az "Engedélyezés" gombra!</strong><br />
                (Ha nem jelenik meg, nézd a böngésző címsorát.)
              </p>
              <Loader size={28} className="spin" style={{ margin: '24px auto 0' }} />
            </>
          )}
          {cameraError && (
            <>
              <AlertCircle size={52} color="#ef4444" style={{ margin: '0 auto 20px' }} />
              <h2>Hiba</h2>
              <p style={{ color: 'var(--muted)', marginTop: 12, lineHeight: 1.6, fontSize: '0.9rem' }}>{cameraError}</p>
              <button className="join-btn" style={{ marginTop: 24 }} onClick={() => { setCameraError(null); setCameraLoading(true); setSession({ ...session }); }}>
                Újra próbálom
              </button>
              <button className="join-btn" style={{ marginTop: 12, background: 'rgba(255,255,255,0.08)', boxShadow: 'none' }} onClick={() => setSession(null)}>
                Vissza
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── SCREEN 3: Room full ──────────────────────────────
  if (peerStatus === 'full') {
    return (
      <div className="join-screen">
        <div className="join-card glass" style={{ textAlign: 'center' }}>
          <Users size={52} color="#ef4444" style={{ margin: '0 auto 20px' }} />
          <h2>A szoba megtelt</h2>
          <p style={{ color: 'var(--muted)', marginTop: 12 }}>Ebben a szobában már 4 fő van.</p>
          <button className="join-btn" onClick={() => window.location.reload()}>Vissza</button>
        </div>
      </div>
    );
  }

  // ── SCREEN 3b: PeerJS error ──────────────────────────
  if (peerStatus === 'error' || peerStatus === 'full') {
    return (
      <div className="join-screen">
        <div className="join-card glass" style={{ textAlign: 'center' }}>
          <AlertCircle size={52} color="#ef4444" style={{ margin: '0 auto 20px' }} />
          <h2>{peerStatus === 'full' ? 'A szoba megtelt' : 'Kapcsolódási hiba'}</h2>
          <p style={{ color: 'var(--muted)', marginTop: 12, lineHeight: 1.6, fontSize: '0.9rem' }}>
            {peerStatus === 'full' ? 'Ebben a szobában már 4 fő van.' : 'Nem sikerült csatlakozni. Kérlek frissítsd az oldalt!'}
          </p>
          <button className="join-btn" style={{ marginTop: 24 }} onClick={() => window.location.reload()}>Újra próbálom</button>
        </div>
      </div>
    );
  }

  // ── SCREEN 4: Call ───────────────────────────────────
  return (
    <div className="app-container">
      <header className="app-header glass">
        <div className="logo"><Video size={22} /><span>FamilyConnect</span></div>
        <div className="header-right">
          <div className={`status-chip ${peerStatus === 'online' ? 'online' : 'connecting'}`}>
            {peerStatus === 'online' ? <><span className="dot" />Online {mySlot && `(${mySlot}. slot)`}</> : <><Loader size={12} className="spin" />Csatlakozás...</>}
          </div>
          <span className="room-label">{session.room}</span>
          <button className={`icon-btn ${showChat ? 'active' : ''}`} onClick={() => setShowChat(v => !v)} title="Csevegés">
            <MessageSquare size={18} />
            {messages.length > 0 && !showChat && <span className="msg-badge">{messages.length}</span>}
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
            <div className="waiting-tile glass">
              <Loader size={30} className="spin" />
              <p>Várakozás a többiekre...</p>
              <small>Szoba: <strong>{session.room}</strong></small>
            </div>
          )}
        </div>

        {showChat && (
          <aside className="chat-panel glass">
            <div className="chat-header">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MessageSquare size={16} /> Csevegés</span>
              <button className="icon-btn" onClick={() => setShowChat(false)}><X size={18} /></button>
            </div>
            <div className="chat-messages">
              {messages.length === 0 && <div className="chat-empty">Még nincs üzenet.</div>}
              {messages.map(m => (
                <div key={m.id} className={`message ${m.sender === session.name ? 'sent' : 'received'}`}>
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
        <button className={`ctrl-btn ${isMuted ? 'danger' : 'active'}`} onClick={toggleMute} title={isMuted ? 'Mikrofon be' : 'Mikrofon ki'}>
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button className={`ctrl-btn ${isVidOff ? 'danger' : 'active'}`} onClick={toggleVid} title={isVidOff ? 'Kamera be' : 'Kamera ki'}>
          {isVidOff ? <VideoOff size={20} /> : <Video size={20} />}
        </button>
        <div className="ctrl-divider" />
        <button className="ctrl-btn emoji" onClick={() => sendReaction('❤️')}><Heart size={20} color="#fb7185" /></button>
        <button className="ctrl-btn emoji" onClick={() => sendReaction('👍')}><ThumbsUp size={20} color="#60a5fa" /></button>
        <button className="ctrl-btn emoji" onClick={() => sendReaction('😂')}><Laugh size={20} color="#fbbf24" /></button>
        <button className="ctrl-btn emoji" onClick={() => sendReaction('👋')}><Hand size={20} color="#c084fc" /></button>
        <div className="ctrl-divider" />
        <button className="ctrl-btn danger" onClick={() => window.location.reload()} title="Kilépés"><PhoneOff size={20} /></button>
      </div>

      {reactions.map(r => (
        <div key={r.id} className="emoji-burst" style={{ left: `${10 + Math.random() * 80}%`, bottom: 90 }}>
          {r.emoji}
        </div>
      ))}
    </div>
  );
}

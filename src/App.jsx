import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video, VideoOff, Mic, MicOff, Send, PhoneOff,
  Users, MessageSquare, Heart, ThumbsUp, Laugh, Hand, X,
  Loader, AlertCircle,
} from 'lucide-react';
import { useFamilySync } from './hooks/useFamilySync';
import './index.css';

// ─── Video Tile ───────────────────────────────────────────────────────────────
const VideoTile = ({ stream, label, isLocal, isMuted }) => {
  const videoRef = useRef();

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={`video-tile glass ${isLocal ? 'local' : ''}`}>
      <video ref={videoRef} autoPlay playsInline muted={isLocal || isMuted} />
      <div className="video-info">
        {isLocal ? <Video size={14} /> : <Users size={14} />}
        <span>{label}</span>
        {isLocal && isMuted && <span className="muted-badge">🔇</span>}
      </div>
    </div>
  );
};

// ─── Join Screen ──────────────────────────────────────────────────────────────
const JoinScreen = ({ onJoin }) => {
  const [name, setName] = useState('');
  const [room, setRoom] = useState('csaladi-kor');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim() && room.trim()) onJoin(name.trim(), room.trim());
  };

  return (
    <div className="join-screen">
      <form className="join-card glass" onSubmit={handleSubmit}>
        <div className="join-logo">
          <Video size={40} />
          <span>FamilyConnect</span>
        </div>
        <h1>Üdvözlünk!</h1>
        <p className="join-subtitle">
          Lépj be a közös szobába, és találkozz a családoddal.
        </p>
        <label className="input-label">A te neved</label>
        <input
          className="join-input"
          placeholder="pl. Balázs"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          required
        />
        <label className="input-label">Szoba neve</label>
        <input
          className="join-input"
          placeholder="pl. csaladi-kor"
          value={room}
          onChange={e => setRoom(e.target.value)}
          required
        />
        <button type="submit" className="join-btn">
          Csatlakozás →
        </button>
        <p className="join-hint">Mindenki, aki ugyanezt a szobanevet írja be, automatikusan megjelenik nálad.</p>
      </form>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null); // { name, room }
  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const chatBottomRef = useRef(null);

  const {
    localStream,
    remoteStreams,
    messages,
    reactions,
    status,
    peerNames,
    mediaError,
    sendMessage,
    sendReaction,
  } = useFamilySync(session?.room ?? null, session?.name ?? null);

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleJoin = (name, room) => setSession({ name, room });

  const handleSend = (e) => {
    e.preventDefault();
    if (inputText.trim()) {
      sendMessage(inputText.trim());
      setInputText('');
    }
  };

  const toggleMute = () => {
    if (localStream) {
      const next = !isMuted;
      localStream.getAudioTracks().forEach(t => (t.enabled = !next));
      setIsMuted(next);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const next = !isVideoOff;
      localStream.getVideoTracks().forEach(t => (t.enabled = !next));
      setIsVideoOff(next);
    }
  };

  const handleLeave = () => {
    window.location.reload();
  };

  // ── Join screen ────────────────────────────────────
  if (!session) return <JoinScreen onJoin={handleJoin} />;

  // ── Media error ────────────────────────────────────
  if (mediaError) {
    return (
      <div className="join-screen">
        <div className="join-card glass error-card">
          <AlertCircle size={48} color="#f87171" />
          <h2 style={{ marginTop: 16 }}>Hiba</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>{mediaError}</p>
          <button className="join-btn" onClick={() => window.location.reload()}>
            Újra próbálom
          </button>
        </div>
      </div>
    );
  }

  // ── Room full ──────────────────────────────────────
  if (status === 'room-full') {
    return (
      <div className="join-screen">
        <div className="join-card glass error-card">
          <Users size={48} color="#f87171" />
          <h2 style={{ marginTop: 16 }}>A szoba megtelt</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
            Ebben a szobában már {4} fő tartózkodik.
          </p>
          <button className="join-btn" onClick={() => window.location.reload()}>
            Vissza
          </button>
        </div>
      </div>
    );
  }

  // ── Call screen ────────────────────────────────────
  return (
    <div className="app-container">

      {/* Header */}
      <header className="app-header glass">
        <div className="logo">
          <Video size={22} />
          <span>FamilyConnect</span>
        </div>
        <div className="header-right">
          {/* Status chip */}
          <div className={`status-chip ${status === 'connected' ? 'online' : 'connecting'}`}>
            {status === 'connected' ? (
              <><span className="dot" />Online</>
            ) : (
              <><Loader size={12} className="spin" />Csatlakozás...</>
            )}
          </div>
          {/* Room label */}
          <span className="room-label">{session.room}</span>
          {/* Chat toggle */}
          <button
            className={`icon-btn ${showChat ? 'active' : ''}`}
            onClick={() => setShowChat(v => !v)}
            title="Csevegés"
          >
            <MessageSquare size={20} />
            {messages.length > 0 && !showChat && (
              <span className="msg-badge">{messages.length}</span>
            )}
          </button>
        </div>
      </header>

      {/* Main area */}
      <div className="main-area">

        {/* Video grid */}
        <div className={`video-grid participants-${1 + remoteStreams.length}`}>
          {localStream && (
            <VideoTile
              stream={localStream}
              label={`${session.name} (Te)`}
              isLocal
              isMuted={isMuted}
            />
          )}
          {remoteStreams.map(rs => (
            <VideoTile
              key={rs.id}
              stream={rs.stream}
              label={peerNames[rs.id] || 'Csatlakozó...'}
            />
          ))}
          {remoteStreams.length === 0 && status === 'connected' && (
            <div className="waiting-tile glass">
              <Loader size={32} className="spin" />
              <p>Várakozás a többiekre...</p>
              <small>Szoba: <strong>{session.room}</strong></small>
            </div>
          )}
        </div>

        {/* Chat sidebar */}
        {showChat && (
          <aside className="chat-panel glass">
            <div className="chat-header">
              <span><MessageSquare size={16} /> Csevegés</span>
              <button className="icon-btn" onClick={() => setShowChat(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="chat-messages">
              {messages.length === 0 && (
                <div className="chat-empty">Még nincs üzenet. Legyél te az első!</div>
              )}
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`message ${msg.sender === session.name ? 'sent' : 'received'}`}
                >
                  <div className="message-sender">{msg.sender}</div>
                  <div className="message-text">{msg.text}</div>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>
            <form className="chat-input-row" onSubmit={handleSend}>
              <input
                className="chat-input"
                placeholder="Üzenet küldése..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
              />
              <button type="submit" className="send-btn" disabled={!inputText.trim()}>
                <Send size={18} />
              </button>
            </form>
          </aside>
        )}
      </div>

      {/* Controls */}
      <div className="controls-bar glass">
        <button
          className={`ctrl-btn ${isMuted ? 'danger' : 'active'}`}
          onClick={toggleMute}
          title={isMuted ? 'Mikrofon be' : 'Mikrofon ki'}
        >
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button
          className={`ctrl-btn ${isVideoOff ? 'danger' : 'active'}`}
          onClick={toggleVideo}
          title={isVideoOff ? 'Kamera be' : 'Kamera ki'}
        >
          {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
        </button>

        <div className="ctrl-divider" />

        <button className="ctrl-btn emoji" onClick={() => sendReaction('❤️')} title="Szív">
          <Heart size={20} color="#fb7185" />
        </button>
        <button className="ctrl-btn emoji" onClick={() => sendReaction('👍')} title="Jó">
          <ThumbsUp size={20} color="#60a5fa" />
        </button>
        <button className="ctrl-btn emoji" onClick={() => sendReaction('😂')} title="Nevetés">
          <Laugh size={20} color="#fbbf24" />
        </button>
        <button className="ctrl-btn emoji" onClick={() => sendReaction('👋')} title="Integetés">
          <Hand size={20} color="#c084fc" />
        </button>

        <div className="ctrl-divider" />

        <button className="ctrl-btn danger" onClick={handleLeave} title="Kilépés">
          <PhoneOff size={20} />
        </button>
      </div>

      {/* Emoji bursts */}
      {reactions.map(r => (
        <div
          key={r.id}
          className="emoji-burst"
          style={{ left: `${10 + Math.random() * 80}%`, bottom: '90px' }}
        >
          {r.emoji}
        </div>
      ))}
    </div>
  );
}

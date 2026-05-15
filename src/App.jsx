import React, { useState, useEffect, useRef } from 'react';
import { 
  Video, VideoOff, Mic, MicOff, Send, PhoneOff, 
  Users, MessageSquare, Heart, ThumbsUp, Laugh, Hand, X
} from 'lucide-react';
import { useFamilySync } from './hooks/useFamilySync';
import './index.css';

const VideoTile = ({ stream, label, isLocal }) => {
  const videoRef = useRef();

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-tile glass">
      <video ref={videoRef} autoPlay playsInline muted={isLocal} />
      <div className="video-info">
        {isLocal ? <Video size={16} /> : <Users size={16} />}
        <span>{label}</span>
      </div>
    </div>
  );
};

function App() {
  const [inCall, setInCall] = useState(false);
  const [roomId, setRoomId] = useState('csaladi-kor');
  const [userId, setUserId] = useState('');
  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const { 
    localStream, remoteStreams, messages, reactions, 
    connected, activeSlot, sendMessage, sendReaction 
  } = useFamilySync(inCall ? roomId : null, userId);

  const handleJoin = () => {
    if (userId.trim() && roomId.trim()) setInCall(true);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (inputText.trim()) {
      sendMessage(inputText);
      setInputText('');
    }
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(t => t.enabled = isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  };

  if (!inCall) {
    return (
      <div className="join-screen">
        <div className="join-card glass">
          <div className="logo" style={{ justifyContent: 'center', marginBottom: '32px' }}>
            <Video size={48} /> FamilyConnect
          </div>
          <h2>Üdvözlünk!</h2>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)', marginBottom: '32px' }}>
            Lépj be a közös családi szobába.
          </p>
          <input 
            type="text" 
            className="chat-input" 
            placeholder="Neved (pl. Balázs)" 
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
          <input 
            type="text" 
            className="chat-input" 
            placeholder="Szoba neve (pl. csaladi-kor)" 
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button className="join-btn" onClick={handleJoin}>Belépés</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="header glass">
        <div className="logo">
          <Video size={24} /> FamilyConnect
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <button 
            className={`control-btn ${showChat ? 'active' : ''}`} 
            style={{ width: '40px', height: '40px' }}
            onClick={() => setShowChat(!showChat)}
          >
            <MessageSquare size={20} />
          </button>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: connected ? '#4ade80' : '#f87171', fontWeight: '600' }}>
              ● {connected ? 'Online' : 'Csatlakozás...'}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              Szoba: {roomId} {activeSlot && `(#${activeSlot})`}
            </div>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="video-grid">
          {localStream && <VideoTile stream={localStream} label={`${userId} (Te)`} isLocal={true} />}
          {remoteStreams.map(rs => (
            <VideoTile key={rs.id} stream={rs.stream} label="Résztvevő" />
          ))}
          {remoteStreams.length === 0 && (
            <div className="glass" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ marginBottom: '16px', fontSize: '1.2rem' }}>Várakozás a többiekre...</div>
              <div style={{ fontSize: '0.9rem' }}>A(z) "{roomId}" szobában vagy.</div>
              <div style={{ fontSize: '0.8rem', marginTop: '8px' }}>Győződj meg róla, hogy mindenki ugyanezt a szobanevet írta be!</div>
            </div>
          )}
        </div>

        <aside className={`chat-panel glass ${showChat ? 'active' : ''}`}>
          <div className="header" style={{ height: '56px', borderBottom: '1px solid var(--glass-border)', padding: '0 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '600' }}>
              <MessageSquare size={18} /> Csevegés
            </div>
            <button className="control-btn" style={{ width: '36px', height: '36px' }} onClick={() => setShowChat(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.sender === userId ? 'sent' : 'received'}`}>
                <div className="message-sender">{msg.sender}</div>
                <div>{msg.text}</div>
              </div>
            ))}
          </div>
          <form className="chat-input-area" onSubmit={handleSendMessage}>
            <input 
              type="text" 
              className="chat-input" 
              placeholder="Üzenet küldése..." 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              style={{ marginBottom: 0 }}
            />
            <button type="submit" className="control-btn active" style={{ width: '42px', height: '42px' }}>
              <Send size={20} />
            </button>
          </form>
        </aside>
      </main>

      <div className="controls-bar glass">
        <button className={`control-btn ${isMuted ? 'danger' : 'active'}`} onClick={toggleMute}>
          {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        <button className={`control-btn ${isVideoOff ? 'danger' : 'active'}`} onClick={toggleVideo}>
          {isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
        </button>
        <div style={{ width: '1px', background: 'var(--glass-border)', margin: '0 8px' }} />
        <button className="control-btn" onClick={() => sendReaction('❤️')}><Heart size={22} color="#fb7185" /></button>
        <button className="control-btn" onClick={() => sendReaction('👍')}><ThumbsUp size={22} color="#60a5fa" /></button>
        <button className="control-btn" onClick={() => sendReaction('😂')}><Laugh size={22} color="#fbbf24" /></button>
        <button className="control-btn" onClick={() => sendReaction('👋')}><Hand size={22} color="#c084fc" /></button>
        <div style={{ width: '1px', background: 'var(--glass-border)', margin: '0 8px' }} />
        <button className="control-btn danger" onClick={() => window.location.reload()}>
          <PhoneOff size={22} />
        </button>
      </div>

      {reactions.map(r => (
        <div key={r.id} className="emoji-burst" style={{ left: `${Math.random() * 80 + 10}%`, bottom: '100px' }}>
          {r.emoji}
        </div>
      ))}
    </div>
  );
}

export default App;

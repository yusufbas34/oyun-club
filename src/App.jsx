import { useState, useEffect, useCallback, useRef } from 'react';

var BACKEND_URL = 'https://oyun-club-backend-production.up.railway.app';
 
function useSocket(username) {
  var socketRef = useRef(null);
  var s1 = useState(false);
  var isConnected = s1[0];
  var setIsConnected = s1[1];
  var s2 = useState(false);
  var isRegistered = s2[0];
  var setIsRegistered = s2[1];
  var s3 = useState(null);
  var roomData = s3[0];
  var setRoomData = s3[1];
  var s4 = useState([]);
  var messages = s4[0];
  var setMessages = s4[1];
  var s5 = useState(null);
  var socketError = s5[0];
  var setSocketError = s5[1];
 
  useEffect(
    function () {
      if (!username) return;
      var socket;
      import('https://cdn.socket.io/4.7.5/socket.io.esm.min.js')
        .then(function (mod) {
          socket = mod.io(BACKEND_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
          });
          socketRef.current = socket;

          socket.on('connect', function () {
            console.log('Socket baglandi:', socket.id);
            setIsConnected(true);
            setSocketError(null);
            socket.emit('register', { name: username }, function (res) {
              if (res && res.success) {
                console.log('Kayit basarili:', res.user);
                setIsRegistered(true);
              } else {
                setSocketError(res ? res.error : 'Kayit basarisiz');
              }
            });
          });

          socket.on('disconnect', function () {
            setIsConnected(false);
            setIsRegistered(false);
          });

          socket.on('connect_error', function () {
            setSocketError('Sunucuya baglanamadi');
            setIsConnected(false);
          });

          socket.on('room_updated', function (data) {
            console.log('Oda guncellendi:', data);
            setRoomData(function (prev) {
              if (!prev) return data;
              if (
                data.players &&
                prev.players &&
                data.players.length < prev.players.length
              ) {
                return Object.assign({}, data, {
                  state: 'waiting',
                  gameState: null,
                  gameResult: null,
                  rpsReveal: null,
                });
              }
              return Object.assign({}, prev, data);
            });
          });

          socket.on('player_left', function (data) {
            setMessages(function (prev) {
              return prev.concat([
                { type: 'system', text: data.name + ' masadan ayrildi' },
              ]);
            });
            setRoomData(function (prev) {
              if (!prev) return prev;
              return Object.assign({}, prev, {
                state: 'waiting',
                gameState: null,
                gameResult: null,
                rpsReveal: null,
              });
            });
          });

          socket.on('chat_new_message', function (msg) {
            setMessages(function (prev) {
              return prev.concat([
                {
                  username: msg.name,
                  text: msg.message,
                  timestamp: msg.timestamp,
                },
              ]);
            });
          });

          socket.on('game_started', function (data) {
            console.log('Oyun basladi:', data);
            setRoomData(function (prev) {
              if (!prev) return data;
              return Object.assign({}, prev, data, {
                rpsReveal: null,
                gameResult: null,
              });
            });
          });

          socket.on('game_state_updated', function (data) {
            setRoomData(function (prev) {
              if (!prev) return prev;
              return Object.assign({}, prev, {
                gameState: data.gameState,
                state: data.state,
              });
            });
          });

          socket.on('game_finished', function (data) {
            console.log('Oyun bitti:', data);
            setRoomData(function (prev) {
              if (!prev) return prev;
              return Object.assign({}, prev, {
                state: 'finished',
                gameResult: data,
                gameState: prev.gameState
                  ? Object.assign({}, prev.gameState, {
                      winner: data.winner,
                      winLine: data.winLine,
                    })
                  : null,
              });
            });
          });

          socket.on('rps_opponent_chose', function () {
            console.log('Rakip secim yapti');
          });

          socket.on('rps_reveal', function (data) {
            console.log('RPS sonuc:', data);
            setRoomData(function (prev) {
              if (!prev) return prev;
              return Object.assign({}, prev, {
                rpsReveal: data,
                rpsScores: data.scores,
                state: data.gameWinner !== null ? 'finished' : prev.state,
                gameResult:
                  data.gameWinner !== null
                    ? {
                        winner: data.gameWinner,
                        winnerName: prev.players[data.gameWinner]
                          ? prev.players[data.gameWinner].name
                          : '?',
                      }
                    : prev.gameResult,
              });
            });
          });

          socket.on('rps_new_round', function (data) {
            console.log('Yeni raund:', data);
            setRoomData(function (prev) {
              if (!prev) return prev;
              return Object.assign({}, prev, {
                rpsReveal: null,
                rpsRound: data.round,
                rpsScores: data.scores,
              });
            });
          });
        })
        .catch(function () {
          setSocketError('Socket.io yuklenemedi');
        });

      return function () {
        if (socket) {
          socket.removeAllListeners();
          socket.disconnect();
        }
        socketRef.current = null;
      };
    },
    [username]
  );

  var createRoom = useCallback(
    function (gameId) {
      if (!socketRef.current || !isRegistered) return;
      socketRef.current.emit('create_room', { gameId: gameId }, function (res) {
        if (res && res.success) {
          setRoomData(res.room);
          setMessages([]);
        } else {
          setSocketError(res ? res.error : 'Oda olusturulamadi');
        }
      });
    },
    [isRegistered]
  );

  var joinRoom = useCallback(
    function (roomCode) {
      if (!socketRef.current || !isRegistered) return;
      socketRef.current.emit('join_room', { roomId: roomCode }, function (res) {
        if (res && res.success) {
          setRoomData(res.room);
          setMessages([]);
        } else {
          setSocketError(res ? res.error : 'Katilma basarisiz');
        }
      });
    },
    [isRegistered]
  );

  var leaveRoom = useCallback(function () {
    if (!socketRef.current) return;
    socketRef.current.emit('leave_room', null, function () {
      setRoomData(null);
      setMessages([]);
    });
  }, []);

  var sendMessage = useCallback(function (text) {
    if (!socketRef.current || !text.trim()) return;
    socketRef.current.emit(
      'chat_message',
      { message: text.trim() },
      function () {}
    );
  }, []);

  var startGame = useCallback(function () {
    if (!socketRef.current) return;
    socketRef.current.emit('start_game', null, function (res) {
      if (res && !res.success) {
        setSocketError(res.error || 'Baslatilamadi');
      }
    });
  }, []);

  var sendXOXMove = useCallback(function (cellIndex) {
    if (!socketRef.current) return;
    setSocketError(null);
    socketRef.current.emit(
      'xox_move',
      { cellIndex: cellIndex },
      function (res) {
        if (res && res.error) {
          console.log('Hamle:', res.error);
        }
      }
    );
  }, []);

  var sendRPSChoice = useCallback(function (choice) {
    if (!socketRef.current) return;
    setSocketError(null);
    socketRef.current.emit('rps_choice', { choice: choice }, function (res) {
      if (res && res.error) {
        console.log('RPS:', res.error);
      }
    });
  }, []);

  var restartGame = useCallback(function () {
    if (!socketRef.current) return;
    setSocketError(null);
    socketRef.current.emit('restart_game', null, function (res) {
      if (res && res.error) {
        console.log('Restart:', res.error);
      } else {
        setRoomData(function (prev) {
          if (!prev) return prev;
          return Object.assign({}, prev, {
            gameResult: null,
            rpsReveal: null,
            rpsScores: null,
            rpsRound: null,
          });
        });
      }
    });
  }, []);

  return {
    isConnected: isConnected,
    isRegistered: isRegistered,
    roomData: roomData,
    messages: messages,
    socketError: socketError,
    createRoom: createRoom,
    joinRoom: joinRoom,
    leaveRoom: leaveRoom,
    sendMessage: sendMessage,
    startGame: startGame,
    sendXOXMove: sendXOXMove,
    sendRPSChoice: sendRPSChoice,
    restartGame: restartGame,
    setSocketError: setSocketError,
  };
}

// ============================================================
// CHAT PANEL
// ============================================================
function ChatPanel(props) {
  var messages = props.messages || [];
  var onSend = props.onSend;
  var currentUser = props.currentUser;
  var isConnected = props.isConnected || false;
  var playerCount = props.playerCount || 0;
  var s1 = useState('');
  var text = s1[0];
  var setText = s1[1];
  var messagesEndRef = useRef(null);
  var inputRef = useRef(null);

  useEffect(
    function () {
      if (messagesEndRef.current)
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    },
    [messages]
  );

  function handleSend() {
    if (!text.trim() || !onSend) return;
    onSend(text.trim());
    setText('');
    if (inputRef.current) inputRef.current.focus();
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: 360,
        height: 400,
        borderRadius: 16,
        overflow: 'hidden',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'var(--surface-hover)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text)',
            margin: 0,
          }}
        >
          Masa Sohbeti
        </h3>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {isConnected ? playerCount + ' oyuncu' : 'Baglaniyor...'}
        </span>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              fontSize: 13,
              textAlign: 'center',
              padding: 20,
              opacity: 0.5,
            }}
          >
            Henuz mesaj yok.
          </div>
        ) : (
          messages.map(function (msg, i) {
            if (msg.type === 'system')
              return (
                <div
                  key={i}
                  style={{
                    textAlign: 'center',
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    padding: '4px 0',
                    fontStyle: 'italic',
                  }}
                >
                  {msg.text}
                </div>
              );
            var isMine = msg.username === currentUser;
            return (
              <div
                key={i}
                style={{
                  maxWidth: '80%',
                  padding: '8px 12px',
                  borderRadius: isMine
                    ? '12px 12px 4px 12px'
                    : '12px 12px 12px 4px',
                  background: isMine ? '#6366f1' : 'var(--surface-hover)',
                  color: isMine ? '#fff' : 'var(--text)',
                  alignSelf: isMine ? 'flex-end' : 'flex-start',
                  fontSize: 13,
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                }}
              >
                {!isMine && (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#818cf8',
                      marginBottom: 2,
                    }}
                  >
                    {msg.username}
                  </div>
                )}
                <div>{msg.text}</div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderTop: '1px solid var(--border)',
        }}
      >
        <input
          ref={inputRef}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 20,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 13,
            outline: 'none',
            fontFamily: "'DM Sans', sans-serif",
          }}
          type="text"
          placeholder={
            isConnected ? 'Mesajinizi yazin...' : 'Baglanti bekleniyor...'
          }
          value={text}
          onChange={function (e) {
            setText(e.target.value);
          }}
          onKeyDown={function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={!isConnected}
          maxLength={500}
        />
        <button
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: 'none',
            background: '#6366f1',
            color: '#fff',
            cursor: text.trim() && isConnected ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            opacity: text.trim() && isConnected ? 1 : 0.4,
          }}
          onClick={handleSend}
          disabled={!text.trim() || !isConnected}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MULTIPLAYER XOX
// ============================================================
function MultiplayerXOX(props) {
  var gs = props.gameState;
  var players = props.players;
  var username = props.username;
  var onMove = props.onMove;
  if (!gs) return null;
  var myIndex = -1;
  for (var i = 0; i < players.length; i++) {
    if (players[i].name === username) {
      myIndex = i;
      break;
    }
  }
  var isMyTurn = gs.currentTurn === myIndex;
  var mySymbol = myIndex === 0 ? 'X' : 'O';
  var turnPlayerName = players[gs.currentTurn]
    ? players[gs.currentTurn].name
    : '?';

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        marginBottom: 12,
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div
          style={{
            fontSize: 14,
            color: 'var(--text-secondary)',
            marginBottom: 4,
          }}
        >
          Sen:{' '}
          <strong style={{ color: myIndex === 0 ? '#E63946' : '#457B9D' }}>
            {mySymbol}
          </strong>{' '}
          — Rakip:{' '}
          <strong style={{ color: myIndex === 0 ? '#457B9D' : '#E63946' }}>
            {myIndex === 0 ? 'O' : 'X'}
          </strong>
        </div>
        {gs.winner === null && (
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: isMyTurn ? '#2A9D8F' : 'var(--text-secondary)',
            }}
          >
            {isMyTurn ? 'Senin siran!' : turnPlayerName + ' oynuyor...'}
          </div>
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
          maxWidth: 240,
          margin: '0 auto',
        }}
      >
        {gs.board.map(function (cell, i) {
          var isWinCell = gs.winLine && gs.winLine.indexOf(i) !== -1;
          return (
            <button
              key={i}
              onClick={function () {
                if (isMyTurn && !cell && gs.winner === null) onMove(i);
              }}
              style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: 8,
                border: isWinCell
                  ? '2px solid #E63946'
                  : '2px solid var(--border)',
                background: isWinCell
                  ? cell === 'X'
                    ? '#FEE2E2'
                    : '#DBEAFE'
                  : 'var(--surface-hover)',
                cursor:
                  isMyTurn && !cell && gs.winner === null
                    ? 'pointer'
                    : 'default',
                fontSize: 28,
                fontFamily: "'Sora', sans-serif",
                fontWeight: 800,
                color: cell === 'X' ? '#E63946' : '#457B9D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: !isMyTurn && !cell && gs.winner === null ? 0.5 : 1,
              }}
            >
              {cell}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// MULTIPLAYER RPS
// ============================================================
function MultiplayerRPS(props) {
  var players = props.players;
  var username = props.username;
  var onChoice = props.onChoice;
  var rpsReveal = props.rpsReveal;
  var rpsScores = props.rpsScores;
  var rpsRound = props.rpsRound;
  var gameState = props.gameState;

  var s1 = useState(false);
  var hasChosen = s1[0];
  var setHasChosen = s1[1];
  var s2 = useState(null);
  var myChoice = s2[0];
  var setMyChoice = s2[1];

  var myIndex = -1;
  for (var i = 0; i < players.length; i++) {
    if (players[i].name === username) {
      myIndex = i;
      break;
    }
  }

  // rpsReveal null olunca (yeni raund) seçimi sıfırla
  useEffect(
    function () {
      if (!rpsReveal) {
        setHasChosen(false);
        setMyChoice(null);
      }
    },
    [rpsReveal]
  );

  var choices = [
    { id: 'rock', emoji: '✊', name: 'Tas' },
    { id: 'paper', emoji: '✋', name: 'Kagit' },
    { id: 'scissors', emoji: '✌️', name: 'Makas' },
  ];

  // Skor: önce rpsScores (güncel), yoksa gameState.scores, yoksa [0,0]
  var scores = rpsScores || (gameState ? gameState.scores : null) || [0, 0];
  var round = rpsRound || (gameState ? gameState.round : null) || 1;

  function handleChoice(choiceId) {
    if (hasChosen) return;
    setHasChosen(true);
    setMyChoice(choiceId);
    onChoice(choiceId);
  }

  function getEmoji(id) {
    for (var j = 0; j < choices.length; j++) {
      if (choices[j].id === id) return choices[j].emoji;
    }
    return '?';
  }

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        marginBottom: 12,
      }}
    >
      {/* Skor tablosu */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 24,
          marginBottom: 16,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {players[0] ? players[0].name : '?'}
            {myIndex === 0 ? ' (Sen)' : ''}
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              fontFamily: "'Sora', sans-serif",
              color: '#2A9D8F',
            }}
          >
            {scores[0]}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginBottom: 4,
            }}
          >
            Raund
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              fontFamily: "'Sora', sans-serif",
            }}
          >
            {round}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
            ilk 3 kazanir
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {players[1] ? players[1].name : '?'}
            {myIndex === 1 ? ' (Sen)' : ''}
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              fontFamily: "'Sora', sans-serif",
              color: '#E63946',
            }}
          >
            {scores[1]}
          </div>
        </div>
      </div>

      {/* Sonuç göster */}
      {rpsReveal && rpsReveal.choices && (
        <div
          style={{
            textAlign: 'center',
            marginBottom: 16,
            padding: 12,
            borderRadius: 10,
            background: 'var(--surface-hover)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 24,
              marginBottom: 8,
            }}
          >
            <div>
              <div style={{ fontSize: 48 }}>
                {getEmoji(rpsReveal.choices[0])}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {players[0] ? players[0].name : ''}
              </div>
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--text-secondary)',
              }}
            >
              vs
            </div>
            <div>
              <div style={{ fontSize: 48 }}>
                {getEmoji(rpsReveal.choices[1])}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {players[1] ? players[1].name : ''}
              </div>
            </div>
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color:
                rpsReveal.roundResult === 'draw'
                  ? 'var(--text-secondary)'
                  : rpsReveal.roundResult === myIndex
                  ? '#2A9D8F'
                  : '#E63946',
            }}
          >
            {rpsReveal.roundResult === 'draw'
              ? 'Berabere!'
              : rpsReveal.roundResult === myIndex
              ? 'Bu eli kazandin!'
              : 'Bu eli kaybettin!'}
          </div>
          {rpsReveal.gameWinner !== null && (
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                marginTop: 12,
                fontFamily: "'Sora', sans-serif",
                color: rpsReveal.gameWinner === myIndex ? '#2A9D8F' : '#E63946',
              }}
            >
              {rpsReveal.gameWinner === myIndex
                ? 'Oyunu Kazandin! 🎉'
                : (players[rpsReveal.gameWinner]
                    ? players[rpsReveal.gameWinner].name
                    : '') + ' Kazandi!'}
            </div>
          )}
          {rpsReveal.gameWinner === null && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginTop: 8,
              }}
            >
              Sonraki el yakinda...
            </div>
          )}
        </div>
      )}

      {/* Seçim butonları */}
      {!rpsReveal && (
        <div>
          {hasChosen ? (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>
                {getEmoji(myChoice)}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                Secimini yaptin! Rakip bekleniyor...
              </div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  textAlign: 'center',
                  fontSize: 14,
                  color: 'var(--text-secondary)',
                  marginBottom: 12,
                }}
              >
                Secimini yap:
              </div>
              <div
                style={{ display: 'flex', justifyContent: 'center', gap: 12 }}
              >
                {choices.map(function (c) {
                  return (
                    <button
                      key={c.id}
                      onClick={function () {
                        handleChoice(c.id);
                      }}
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 12,
                        border: '2px solid var(--border)',
                        background: 'var(--surface-hover)',
                        cursor: 'pointer',
                        fontSize: 36,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                      }}
                    >
                      <span>{c.emoji}</span>
                      <span
                        style={{ fontSize: 10, color: 'var(--text-secondary)' }}
                      >
                        {c.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MULTIPLAYER LOBBY
// ============================================================
var MP_GAMES = [
  { id: 'xox', name: 'XOX', icon: '❌⭕', players: 2 },
  { id: 'rps', name: 'Taş Kağıt Makas', icon: '✊✋✌️', players: 2 },
];

function MultiplayerLobby(props) {
  var s1 = useState('');
  var username = s1[0];
  var setUsername = s1[1];
  var s2 = useState(false);
  var isNameSet = s2[0];
  var setIsNameSet = s2[1];
  var s3 = useState(null);
  var selectedMPGame = s3[0];
  var setSelectedMPGame = s3[1];
  var s4 = useState(props && props.initialCode ? props.initialCode : '');
  var joinCode = s4[0];
  var setJoinCode = s4[1];

  var sock = useSocket(username);
  var s6 = useState(false);
  var autoJoined = s6[0];
  var setAutoJoined = s6[1];
  useEffect(
    function () {
      if (joinCode && sock.isRegistered && !autoJoined && !sock.roomData) {
        setAutoJoined(true);
        sock.joinRoom(joinCode);
      }
    },
    [sock.isRegistered]
  );

  if (sock.roomData) {
    var players = sock.roomData.players || [];
    var maxP = sock.roomData.maxPlayers || 2;
    var canStart = players.length >= maxP;
    var isHost = players[0] && players[0].name === username;

    return (
      <div
        style={{
          maxWidth: 800,
          margin: '0 auto',
          padding: 24,
          fontFamily: "'DM Sans', sans-serif",
          color: 'var(--text)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderRadius: 10,
            background: 'rgba(74,222,128,0.1)',
            border: '1px solid rgba(74,222,128,0.3)',
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#4ade80',
            }}
          />
          <span>Bagli — {username}</span>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 300 }}>
            <div
              style={{
                padding: 20,
                borderRadius: 14,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                marginBottom: 20,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 4 }}>
                Oda Kodu
              </div>
              <div
                style={{
                  fontFamily: "'Sora', sans-serif",
                  fontSize: 32,
                  fontWeight: 800,
                  letterSpacing: 6,
                  color: '#E63946',
                  padding: '10px 0',
                  userSelect: 'all',
                }}
              >
                {sock.roomData.id}
              </div>
              <div style={{ fontSize: 12, opacity: 0.5 }}>
                Oyun:{' '}
                {sock.roomData.gameId === 'xox'
                  ? 'XOX'
                  : sock.roomData.gameId === 'rps'
                  ? 'Tas Kagit Makas'
                  : sock.roomData.gameId}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Oyuncular ({players.length}/{maxP})
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {players.map(function (p, i) {
                  return (
                    <div
                      key={i}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 20,
                        background: 'rgba(74,222,128,0.15)',
                        border: '1px solid rgba(74,222,128,0.3)',
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      {p.name === username ? 'Sen' : p.name}
                      {i === 0 ? ' (Host)' : ''}
                    </div>
                  );
                })}
                {players.length < maxP && (
                  <div
                    style={{
                      padding: '6px 14px',
                      borderRadius: 20,
                      background: 'var(--surface-hover)',
                      border: '1px solid var(--border)',
                      fontSize: 13,
                    }}
                  >
                    Rakip bekleniyor...
                  </div>
                )}
              </div>
            </div>

            {sock.roomData.state === 'waiting' && canStart && isHost && (
              <button
                onClick={sock.startGame}
                style={{
                  padding: '12px 24px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#2A9D8F',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  marginBottom: 12,
                  width: '100%',
                }}
              >
                Oyunu Baslat
              </button>
            )}
            {sock.roomData.state === 'waiting' && canStart && !isHost && (
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  marginBottom: 12,
                }}
              >
                Host oyunu baslatmasini bekliyor...
              </p>
            )}
            {sock.roomData.state === 'waiting' && !canStart && (
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  marginBottom: 12,
                }}
              >
                Rakip bekleniyor...
              </p>
            )}

            {sock.roomData.state === 'playing' &&
              sock.roomData.gameId === 'xox' && (
                <MultiplayerXOX
                  gameState={sock.roomData.gameState}
                  players={players}
                  username={username}
                  onMove={sock.sendXOXMove}
                />
              )}

            {sock.roomData.state === 'playing' &&
              sock.roomData.gameId === 'rps' && (
                <MultiplayerRPS
                  players={players}
                  username={username}
                  onChoice={sock.sendRPSChoice}
                  rpsReveal={sock.roomData.rpsReveal}
                  rpsScores={sock.roomData.rpsScores}
                  rpsRound={sock.roomData.rpsRound}
                  gameState={sock.roomData.gameState}
                />
              )}

            {sock.roomData.state === 'finished' && (
              <div
                style={{
                  padding: 20,
                  borderRadius: 14,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  marginBottom: 12,
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    fontFamily: "'Sora', sans-serif",
                    marginBottom: 4,
                  }}
                >
                  {sock.roomData.gameResult &&
                  sock.roomData.gameResult.winnerName === username
                    ? 'Kazandin! 🎉'
                    : sock.roomData.gameResult &&
                      sock.roomData.gameResult.winner === 'draw'
                    ? 'Berabere! 🤝'
                    : sock.roomData.gameResult &&
                      sock.roomData.gameResult.winnerName
                    ? sock.roomData.gameResult.winnerName + ' Kazandi!'
                    : 'Oyun Bitti!'}
                </div>
                {sock.roomData.gameState &&
                  sock.roomData.gameId === 'xox' &&
                  sock.roomData.gameState.board && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 4,
                        maxWidth: 150,
                        margin: '8px auto',
                      }}
                    >
                      {sock.roomData.gameState.board.map(function (cell, i) {
                        var isWin =
                          sock.roomData.gameState.winLine &&
                          sock.roomData.gameState.winLine.indexOf(i) !== -1;
                        return (
                          <div
                            key={i}
                            style={{
                              aspectRatio: '1',
                              borderRadius: 4,
                              border: isWin
                                ? '2px solid #E63946'
                                : '1px solid var(--border)',
                              background: isWin
                                ? cell === 'X'
                                  ? '#FEE2E2'
                                  : '#DBEAFE'
                                : 'var(--surface-hover)',
                              fontSize: 16,
                              fontWeight: 800,
                              color: cell === 'X' ? '#E63946' : '#457B9D',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {cell}
                          </div>
                        );
                      })}
                    </div>
                  )}
                {isHost && players.length >= maxP && (
                  <button
                    onClick={sock.restartGame}
                    style={{
                      padding: '10px 24px',
                      borderRadius: 10,
                      border: 'none',
                      background: '#2A9D8F',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                      marginTop: 8,
                    }}
                  >
                    Tekrar Oyna
                  </button>
                )}
                {isHost && players.length < maxP && (
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      marginTop: 8,
                    }}
                  >
                    Tekrar oynamak icin rakip gerekli
                  </p>
                )}
                {!isHost && (
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      marginTop: 8,
                    }}
                  >
                    Host yeni oyun baslatabilir
                  </p>
                )}
              </div>
            )}

            <button
              onClick={sock.leaveRoom}
              style={{
                padding: '10px 24px',
                borderRadius: 10,
                border: 'none',
                background: '#FEE2E2',
                color: '#DC2626',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                marginTop: 8,
              }}
            >
              Masadan Ayril
            </button>
          </div>
          <div style={{ flex: '0 0 360px' }}>
            <ChatPanel
              messages={sock.messages}
              onSend={sock.sendMessage}
              currentUser={username}
              isConnected={sock.isRegistered}
              playerCount={players.length}
            />
          </div>
        </div>
        {sock.socketError && (
          <div
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#fca5a5',
              fontSize: 13,
              marginTop: 16,
            }}
          >
            {sock.socketError}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: 24,
        fontFamily: "'DM Sans', sans-serif",
        color: 'var(--text)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          borderRadius: 10,
          background: sock.isRegistered
            ? 'rgba(74,222,128,0.1)'
            : 'rgba(239,68,68,0.1)',
          border:
            '1px solid ' +
            (sock.isRegistered
              ? 'rgba(74,222,128,0.3)'
              : 'rgba(239,68,68,0.3)'),
          fontSize: 13,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: sock.isRegistered ? '#4ade80' : '#ef4444',
          }}
        />
        <span>
          {sock.isRegistered ? 'Bagli — ' + username : 'Baglaniliyor...'}
        </span>
      </div>
      <div style={{ marginBottom: 24 }}>
        <h2
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 18,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Oyun Sec
        </h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {MP_GAMES.map(function (g) {
            return (
              <div
                key={g.id}
                onClick={function () {
                  setSelectedMPGame(g.id);
                }}
                style={{
                  padding: '14px 20px',
                  borderRadius: 12,
                  border:
                    '2px solid ' +
                    (selectedMPGame === g.id ? '#6366f1' : 'var(--border)'),
                  background:
                    selectedMPGame === g.id
                      ? 'rgba(99,102,241,0.15)'
                      : 'var(--surface)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  minWidth: 140,
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 4 }}>{g.icon}</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</div>
                <div style={{ fontSize: 11, opacity: 0.5 }}>
                  {g.players} oyuncu
                </div>
              </div>
            );
          })}
        </div>
        {selectedMPGame && (
          <button
            onClick={function () {
              sock.setSocketError(null);
              sock.createRoom(selectedMPGame);
            }}
            disabled={!sock.isRegistered}
            style={{
              marginTop: 16,
              padding: '10px 24px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              cursor: sock.isRegistered ? 'pointer' : 'not-allowed',
              opacity: sock.isRegistered ? 1 : 0.5,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Masa Olustur
          </button>
        )}
      </div>
      <div style={{ marginBottom: 24 }}>
        <h2
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 18,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Masaya Katil
        </h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 16,
              fontFamily: 'monospace',
              letterSpacing: 4,
              textTransform: 'uppercase',
              width: 180,
              textAlign: 'center',
              outline: 'none',
            }}
            placeholder="ABCD"
            value={joinCode}
            onChange={function (e) {
              setJoinCode(e.target.value.toUpperCase().slice(0, 6));
            }}
            onKeyDown={function (e) {
              if (e.key === 'Enter' && joinCode.length >= 4)
                sock.joinRoom(joinCode);
            }}
          />
          <button
            onClick={function () {
              sock.joinRoom(joinCode);
            }}
            disabled={joinCode.length < 4 || !sock.isRegistered}
            style={{
              padding: '10px 24px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              cursor:
                joinCode.length >= 4 && sock.isRegistered
                  ? 'pointer'
                  : 'not-allowed',
              opacity: joinCode.length >= 4 && sock.isRegistered ? 1 : 0.5,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Katil
          </button>
        </div>
      </div>
      {sock.socketError && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: 10,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#fca5a5',
            fontSize: 13,
          }}
        >
          {sock.socketError}
        </div>
      )}
    </div>
  );
}
// ============================================================
// CONSTANTS & HELPERS
// ============================================================
const GAMES = [
  {
    id: 'xox',
    name: 'XOX',
    desc: 'Klasik Tic-Tac-Toe',
    icon: '✕○',
    players: 2,
    color: '#E63946',
    bg: 'linear-gradient(135deg, #E63946 0%, #F4845F 100%)',
  },
  {
    id: 'minesweeper',
    name: 'Mayın Tarlası',
    desc: 'Klasik Minesweeper',
    icon: '💣',
    players: 1,
    color: '#457B9D',
    bg: 'linear-gradient(135deg, #457B9D 0%, #48CAE4 100%)',
  },
  {
    id: 'rps',
    name: 'Taş Kağıt Makas',
    desc: 'En iyi 3 kazanır',
    icon: '✊✋✌',
    players: 2,
    color: '#2A9D8F',
    bg: 'linear-gradient(135deg, #2A9D8F 0%, #76C893 100%)',
  },
  {
    id: 'memory',
    name: 'Hafıza Kartları',
    desc: 'Eşleri bul, hafızanı test et',
    icon: '🃏',
    players: 1,
    color: '#7C3AED',
    bg: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',
  },
  {
    id: 'snake',
    name: 'Yılan Oyunu',
    desc: 'Klasik Snake',
    icon: '🐍',
    players: 1,
    color: '#059669',
    bg: 'linear-gradient(135deg, #059669 0%, #34D399 100%)',
  },
];

const generateRoomId = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

// ============================================================
// SOUND SYSTEM (Web Audio API)
// ============================================================
const audioCtxRef = { current: null };
const getAudioCtx = () => {
  if (!audioCtxRef.current) {
    try {
      audioCtxRef.current = new (window.AudioContext ||
        window.webkitAudioContext)();
    } catch (e) {}
  }
  if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
  return audioCtxRef.current;
};

const playSound = (type) => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  const t = ctx.currentTime;

  switch (type) {
    case 'click':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, t);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.start(t);
      osc.stop(t + 0.08);
      break;
    case 'place':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.exponentialRampToValueAtTime(680, t + 0.06);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.start(t);
      osc.stop(t + 0.1);
      break;
    case 'match':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523, t);
      osc.frequency.setValueAtTime(659, t + 0.1);
      osc.frequency.setValueAtTime(784, t + 0.2);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
      break;
    case 'win':
      osc.type = 'square';
      [523, 659, 784, 1047].forEach((f, i) => {
        osc.frequency.setValueAtTime(f, t + i * 0.12);
      });
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.start(t);
      osc.stop(t + 0.55);
      break;
    case 'lose':
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.35);
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.4);
      break;
    case 'flip':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, t);
      osc.frequency.exponentialRampToValueAtTime(600, t + 0.05);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.start(t);
      osc.stop(t + 0.06);
      break;
    case 'eat':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(900, t + 0.08);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.start(t);
      osc.stop(t + 0.12);
      break;
    case 'explode':
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.3);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
      break;
    case 'countdown':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, t);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.start(t);
      osc.stop(t + 0.1);
      break;
    default:
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t);
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.start(t);
      osc.stop(t + 0.1);
  }
};

const AVATAR_COLORS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
];

// ============================================================
// GLOBAL STYLES
// ============================================================
const GlobalStyle = ({ dark }) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700&family=Sora:wght@300;400;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: ${dark ? '#0F0F17' : '#FAFAFA'};
      --surface: ${dark ? '#1A1A2E' : '#FFFFFF'};
      --surface-hover: ${dark ? '#252540' : '#F5F5F5'};
      --text: ${dark ? '#E8E8ED' : '#1A1A2E'};
      --text-secondary: ${dark ? '#8B8BA3' : '#6B7280'};
      --border: ${dark ? '#2A2A45' : '#E5E7EB'};
      --accent: ${dark ? '#E8E8ED' : '#1A1A2E'};
      --radius: 16px; --radius-sm: 10px;
      --shadow: ${
        dark
          ? '0 1px 3px rgba(0,0,0,0.2), 0 6px 24px rgba(0,0,0,0.3)'
          : '0 1px 3px rgba(0,0,0,0.04), 0 6px 24px rgba(0,0,0,0.06)'
      };
      --shadow-lg: ${
        dark
          ? '0 4px 12px rgba(0,0,0,0.3), 0 20px 48px rgba(0,0,0,0.4)'
          : '0 4px 12px rgba(0,0,0,0.06), 0 20px 48px rgba(0,0,0,0.1)'
      };
      --transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      --header-bg: ${dark ? 'rgba(15,15,23,0.85)' : 'rgba(255,255,255,0.85)'};
    }
    body { font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; transition: background 0.3s ease, color 0.3s ease; }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes scaleIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
    @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
    @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    @keyframes countUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes popIn { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
    @keyframes confettiBurst { 0% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; } 100% { transform: translateY(-80px) rotate(360deg) scale(0); opacity: 0; } }
    @keyframes slideInRight { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes bounceIn { 0% { transform: scale(0.3); opacity: 0; } 50% { transform: scale(1.05); } 70% { transform: scale(0.95); } 100% { transform: scale(1); opacity: 1; } }
    @keyframes glow { 0%, 100% { box-shadow: 0 0 8px rgba(230,57,70,0.3); } 50% { box-shadow: 0 0 20px rgba(230,57,70,0.6); } }
    @keyframes ripple { 0% { transform: scale(0); opacity: 0.5; } 100% { transform: scale(4); opacity: 0; } }
  `}</style>
);

// ============================================================
// REUSABLE COMPONENTS
// ============================================================
const Button = ({
  children,
  onClick,
  variant = 'primary',
  style = {},
  disabled = false,
}) => {
  const variants = {
    primary: { background: 'var(--accent)', color: '#fff' },
    secondary: {
      background: 'var(--surface)',
      color: 'var(--text)',
      border: '1px solid var(--border)',
    },
    ghost: { background: 'transparent', color: 'var(--text-secondary)' },
    danger: { background: '#FEE2E2', color: '#DC2626' },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 15,
        fontWeight: 600,
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'var(--transition)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: disabled ? 0.5 : 1,
        padding: '12px 24px',
        ...variants[variant],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.target.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.target.style.transform = 'translateY(0)';
      }}
    >
      {children}
    </button>
  );
};

const Card = ({ children, style = {}, onClick, hoverable }) => (
  <div
    onClick={onClick}
    style={{
      background: 'var(--surface)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)',
      border: '1px solid var(--border)',
      padding: 24,
      transition: 'var(--transition)',
      cursor: onClick ? 'pointer' : 'default',
      ...style,
    }}
    onMouseEnter={(e) => {
      if (hoverable || onClick) {
        e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }
    }}
    onMouseLeave={(e) => {
      if (hoverable || onClick) {
        e.currentTarget.style.boxShadow = 'var(--shadow)';
        e.currentTarget.style.transform = 'translateY(0)';
      }
    }}
  >
    {children}
  </div>
);

const Toast = ({ message, visible }) => (
  <div
    style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: `translateX(-50%) translateY(${visible ? 0 : 20}px)`,
      background: 'var(--accent)',
      color: '#fff',
      padding: '12px 24px',
      borderRadius: 50,
      fontSize: 14,
      fontWeight: 500,
      opacity: visible ? 1 : 0,
      transition: 'all 0.3s ease',
      zIndex: 1000,
      fontFamily: "'DM Sans', sans-serif",
      pointerEvents: 'none',
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    }}
  >
    {message}
  </div>
);

const Confetti = ({ active, color = '#E63946' }) => {
  if (!active) return null;
  const particles = Array.from({ length: 20 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    dur: 0.8 + Math.random() * 0.6,
    size: 6 + Math.random() * 8,
    color: [color, '#FFD700', '#4FC3F7', '#81C784', '#BA68C8', '#FF8A65'][
      i % 6
    ],
    rotation: Math.random() * 360,
    xDrift: (Math.random() - 0.5) * 60,
  }));
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 999,
        overflow: 'hidden',
      }}
    >
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: '40%',
            width: p.size,
            height: p.size,
            borderRadius: p.size > 10 ? 2 : '50%',
            background: p.color,
            animation: `confettiBurst ${p.dur}s ease-out ${p.delay}s both`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
};

const SoundToggle = ({ soundOn, onToggle }) => (
  <button
    onClick={onToggle}
    title={soundOn ? 'Sesi Kapat' : 'Sesi Aç'}
    style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      width: 44,
      height: 44,
      borderRadius: '50%',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow)',
      cursor: 'pointer',
      fontSize: 18,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      transition: 'var(--transition)',
    }}
    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
  >
    {soundOn ? '🔊' : '🔇'}
  </button>
);

const Avatar = ({ name, size = 36, gradient, style = {} }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      flexShrink: 0,
      background:
        gradient ||
        AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length],
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontWeight: 700,
      fontSize: size * 0.38,
      fontFamily: "'Sora', sans-serif",
      ...style,
    }}
  >
    {name?.charAt(0).toUpperCase()}
  </div>
);

const StatBox = ({ label, value, color, delay = 0 }) => (
  <div
    style={{
      textAlign: 'center',
      padding: '16px 12px',
      background: 'var(--surface)',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border)',
      animation: 'countUp 0.4s ease',
      animationDelay: `${delay}s`,
      animationFillMode: 'both',
    }}
  >
    <div
      style={{
        fontFamily: "'Sora', sans-serif",
        fontSize: 28,
        fontWeight: 800,
        color: color || 'var(--text)',
      }}
    >
      {value}
    </div>
    <div
      style={{
        fontSize: 12,
        color: 'var(--text-secondary)',
        marginTop: 4,
        fontWeight: 500,
      }}
    >
      {label}
    </div>
  </div>
);

// ============================================================
// HEADER
// ============================================================
const Header = ({
  user,
  onBack,
  showBack,
  onProfile,
  onLeaderboard,
  onMultiplayer,
  onHome,
  dark,
  onToggleDark,
}) => (
  <header
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 20px',
      background: 'var(--header-bg)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      transition: 'background 0.3s ease',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {showBack && (
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 20,
            display: 'flex',
            alignItems: 'center',
            padding: 4,
            color: 'var(--text)',
          }}
        >
          ←
        </button>
      )}
      <span
        onClick={onHome}
        style={{
          fontFamily: "'Sora', sans-serif",
          fontWeight: 800,
          fontSize: 20,
          letterSpacing: '-0.5px',
          cursor: 'pointer',
        }}
      >
        oyun<span style={{ color: '#E63946' }}>.</span>club
      </span>
    </div>
    {user && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={onToggleDark}
          title={dark ? 'Açık Mod' : 'Karanlık Mod'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            padding: '6px 10px',
            borderRadius: 8,
            transition: 'var(--transition)',
            color: 'var(--text)',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = 'var(--surface-hover)')
          }
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          {dark ? '☀️' : '🌙'}
        </button>
        <button
          onClick={onMultiplayer}
          title="Multiplayer"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            padding: '6px 10px',
            borderRadius: 8,
            transition: 'var(--transition)',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = 'var(--surface-hover)')
          }
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          🎮
        </button>
        <button
          onClick={onLeaderboard}
          title="Skor Tablosu"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            padding: '6px 10px',
            borderRadius: 8,
            transition: 'var(--transition)',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = 'var(--surface-hover)')
          }
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          🏆
        </button>
        <button
          onClick={onProfile}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 8px',
            borderRadius: 50,
            transition: 'var(--transition)',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = 'var(--surface-hover)')
          }
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          <Avatar name={user.name} size={32} />
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              maxWidth: 100,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user.name}
          </span>
        </button>
      </div>
    )}
  </header>
);

// ============================================================
// LOGIN PAGE
// ============================================================
const LoginPage = ({ onLogin, dark, onToggleDark }) => {
  const [nickname, setNickname] = useState('');
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: 24,
        transition: 'background 0.3s ease',
        position: 'relative',
      }}
    >
      {onToggleDark && (
        <button
          onClick={onToggleDark}
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 50,
            width: 44,
            height: 44,
            cursor: 'pointer',
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow)',
            transition: 'var(--transition)',
          }}
        >
          {dark ? '☀️' : '🌙'}
        </button>
      )}
      <div
        style={{ maxWidth: 420, width: '100%', animation: 'fadeUp 0.6s ease' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div
            style={{
              fontFamily: "'Sora', sans-serif",
              fontWeight: 800,
              fontSize: 48,
              letterSpacing: '-2px',
              marginBottom: 8,
              lineHeight: 1,
            }}
          >
            oyun<span style={{ color: '#E63946' }}>.</span>club
          </div>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: 16,
              fontWeight: 300,
            }}
          >
            Arkadaşlarınla oyna, eğlen
          </p>
        </div>
        <Card style={{ padding: 32 }}>
          <button
            onClick={() =>
              onLogin({ name: 'Google Kullanıcı', email: 'user@gmail.com' })
            }
            style={{
              width: '100%',
              padding: '14px 20px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              fontFamily: "'DM Sans', sans-serif",
              transition: 'var(--transition)',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = 'var(--surface-hover)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = 'var(--surface)')
            }
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.43 3.44 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Google ile Giriş Yap
          </button>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              margin: '24px 0',
              color: 'var(--text-secondary)',
              fontSize: 13,
            }}
          >
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span>veya</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Takma ad gir..."
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' &&
                nickname.trim() &&
                onLogin({ name: nickname.trim() })
              }
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                fontSize: 15,
                outline: 'none',
                fontFamily: "'DM Sans', sans-serif",
                background: 'var(--surface)',
                color: 'var(--text)',
              }}
            />
            <Button
              onClick={() =>
                nickname.trim() && onLogin({ name: nickname.trim() })
              }
              disabled={!nickname.trim()}
            >
              Giriş
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ============================================================
// PROFILE PAGE
// ============================================================
const ProfilePage = ({ user, stats, onLogout }) => {
  const totalGames = Object.values(stats.games).reduce(
    (a, g) => a + g.played,
    0
  );
  const totalWins = Object.values(stats.games).reduce((a, g) => a + g.wins, 0);
  const winRate =
    totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

  return (
    <div
      style={{
        maxWidth: 520,
        margin: '0 auto',
        padding: '32px 20px',
        animation: 'fadeUp 0.4s ease',
      }}
    >
      <Card
        style={{ textAlign: 'center', padding: '36px 24px', marginBottom: 20 }}
      >
        <Avatar name={user.name} size={80} style={{ margin: '0 auto 16px' }} />
        <h2
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 24,
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          {user.name}
        </h2>
        {user.email && (
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {user.email}
          </p>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginTop: 12,
          }}
        >
          <span
            style={{
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              background:
                winRate >= 60
                  ? '#DCFCE7'
                  : winRate >= 40
                  ? '#FEF9C3'
                  : '#FEE2E2',
              color:
                winRate >= 60
                  ? '#16A34A'
                  : winRate >= 40
                  ? '#CA8A04'
                  : '#DC2626',
            }}
          >
            {winRate >= 60
              ? '🔥 Pro Oyuncu'
              : winRate >= 40
              ? '⚡ Orta Seviye'
              : '🌱 Başlangıç'}
          </span>
        </div>
      </Card>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginBottom: 20,
        }}
      >
        <StatBox
          label="Toplam Oyun"
          value={totalGames}
          color="#457B9D"
          delay={0.05}
        />
        <StatBox
          label="Galibiyet"
          value={totalWins}
          color="#2A9D8F"
          delay={0.1}
        />
        <StatBox
          label="Kazanma %"
          value={`${winRate}%`}
          color="#E63946"
          delay={0.15}
        />
      </div>

      <Card style={{ padding: 20, marginBottom: 20 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 16,
          }}
        >
          Oyun Detayları
        </div>
        {GAMES.map((game, i) => {
          const gs = stats.games[game.id] || { played: 0, wins: 0, losses: 0 };
          const rate =
            gs.played > 0 ? Math.round((gs.wins / gs.played) * 100) : 0;
          return (
            <div
              key={game.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 0',
                borderBottom:
                  i < GAMES.length - 1 ? '1px solid var(--border)' : 'none',
                animation: 'fadeUp 0.3s ease',
                animationDelay: `${i * 0.08}s`,
                animationFillMode: 'both',
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: game.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  flexShrink: 0,
                }}
              >
                {game.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{game.name}</div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    marginTop: 2,
                  }}
                >
                  {gs.played} oyun • {gs.wins}G / {gs.losses}M
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontFamily: "'Sora', sans-serif",
                    fontWeight: 700,
                    fontSize: 18,
                    color: game.color,
                  }}
                >
                  {rate}%
                </div>
                <div
                  style={{
                    width: 48,
                    height: 4,
                    borderRadius: 2,
                    background: 'var(--border)',
                    marginTop: 4,
                  }}
                >
                  <div
                    style={{
                      width: `${rate}%`,
                      height: '100%',
                      borderRadius: 2,
                      background: game.bg,
                      transition: 'width 0.6s ease',
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </Card>

      {stats.history.length > 0 && (
        <Card style={{ padding: 20, marginBottom: 20 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 16,
            }}
          >
            Son Oyunlar
          </div>
          {stats.history
            .slice(-8)
            .reverse()
            .map((h, i) => {
              const g = GAMES.find((gm) => gm.id === h.gameId);
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 0',
                    borderBottom:
                      i < Math.min(stats.history.length, 8) - 1
                        ? '1px solid var(--border)'
                        : 'none',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: g?.bg || '#eee',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                    }}
                  >
                    {g?.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>
                      {g?.name}
                    </span>
                  </div>
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600,
                      background:
                        h.result === 'win'
                          ? '#DCFCE7'
                          : h.result === 'loss'
                          ? '#FEE2E2'
                          : '#F3F4F6',
                      color:
                        h.result === 'win'
                          ? '#16A34A'
                          : h.result === 'loss'
                          ? '#DC2626'
                          : '#6B7280',
                    }}
                  >
                    {h.result === 'win'
                      ? 'Kazandı'
                      : h.result === 'loss'
                      ? 'Kaybetti'
                      : 'Berabere'}
                  </span>
                </div>
              );
            })}
        </Card>
      )}

      <Button variant="danger" onClick={onLogout} style={{ width: '100%' }}>
        Çıkış Yap
      </Button>
    </div>
  );
};

// ============================================================
// LEADERBOARD PAGE (per-game)
// ============================================================
const FAKE_LB = {
  xox: [
    { name: 'AhmetPro', played: 22, wins: 19, avatar: 0 },
    { name: 'BurakXOX', played: 31, wins: 24, avatar: 2 },
    { name: 'EceGamer', played: 18, wins: 14, avatar: 1 },
    { name: 'ZeynepM', played: 15, wins: 10, avatar: 3 },
    { name: 'CanTR', played: 12, wins: 8, avatar: 4 },
    { name: 'MelikeS', played: 10, wins: 5, avatar: 5 },
  ],
  minesweeper: [
    { name: 'EceGamer', played: 40, wins: 32, avatar: 1 },
    { name: 'MelikeS', played: 35, wins: 28, avatar: 5 },
    { name: 'EmreK', played: 22, wins: 18, avatar: 0 },
    { name: 'ZeynepM', played: 20, wins: 14, avatar: 3 },
    { name: 'AsliBot', played: 19, wins: 11, avatar: 1 },
    { name: 'CanTR', played: 14, wins: 7, avatar: 4 },
  ],
  rps: [
    { name: 'CanTR', played: 28, wins: 21, avatar: 4 },
    { name: 'AhmetPro', played: 25, wins: 19, avatar: 0 },
    { name: 'ZeynepM', played: 20, wins: 12, avatar: 3 },
    { name: 'AsliBot', played: 16, wins: 10, avatar: 1 },
    { name: 'EmreK', played: 12, wins: 6, avatar: 0 },
    { name: 'BurakXOX', played: 8, wins: 3, avatar: 2 },
  ],
  memory: [
    { name: 'ZeynepM', played: 30, wins: 25, avatar: 3 },
    { name: 'EceGamer', played: 24, wins: 20, avatar: 1 },
    { name: 'AsliBot', played: 18, wins: 14, avatar: 1 },
    { name: 'AhmetPro', played: 15, wins: 10, avatar: 0 },
    { name: 'MelikeS', played: 12, wins: 7, avatar: 5 },
    { name: 'CanTR', played: 10, wins: 5, avatar: 4 },
  ],
  snake: [
    { name: 'EmreK', played: 35, wins: 28, avatar: 0 },
    { name: 'BurakXOX', played: 28, wins: 22, avatar: 2 },
    { name: 'AhmetPro', played: 20, wins: 16, avatar: 0 },
    { name: 'MelikeS', played: 22, wins: 15, avatar: 5 },
    { name: 'EceGamer', played: 18, wins: 11, avatar: 1 },
    { name: 'ZeynepM', played: 14, wins: 8, avatar: 3 },
  ],
};

const LeaderboardPage = ({ user, stats }) => {
  const [activeTab, setActiveTab] = useState(GAMES[0].id);
  const activeGame = GAMES.find((g) => g.id === activeTab);
  const medals = ['🥇', '🥈', '🥉'];

  const userGameStats = stats.games[activeTab] || {
    played: 0,
    wins: 0,
    losses: 0,
  };
  const fakePlayers = FAKE_LB[activeTab] || [];
  const allPlayers = [
    ...fakePlayers,
    {
      name: user.name,
      played: userGameStats.played,
      wins: userGameStats.wins,
      avatar: 2,
    },
  ].sort((a, b) => b.wins - a.wins);
  const userRank = allPlayers.findIndex((p) => p.name === user.name) + 1;

  return (
    <div
      style={{
        maxWidth: 520,
        margin: '0 auto',
        padding: '32px 20px',
        animation: 'fadeUp 0.4s ease',
      }}
    >
      <h2
        style={{
          fontFamily: "'Sora', sans-serif",
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: '-0.5px',
          marginBottom: 20,
        }}
      >
        🏆 Skor Tablosu
      </h2>

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 24,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
        }}
      >
        {GAMES.map((game) => {
          const isActive = activeTab === game.id;
          return (
            <button
              key={game.id}
              onClick={() => setActiveTab(game.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: 50,
                border: '2px solid',
                borderColor: isActive ? activeGame?.color : 'var(--border)',
                background: isActive ? activeGame?.bg : 'var(--surface)',
                color: isActive ? '#fff' : 'var(--text)',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                transition: 'all 0.25s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 16 }}>{game.icon}</span>
              {game.name}
            </button>
          );
        })}
      </div>

      <Card
        style={{
          padding: '16px 20px',
          marginBottom: 20,
          background: activeGame?.bg,
          color: '#fff',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={user.name} size={40} gradient="rgba(255,255,255,0.2)" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{user.name}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              {userGameStats.played} oyun • {userGameStats.wins}G /{' '}
              {userGameStats.losses}M
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            #{userRank}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>sıralama</div>
        </div>
      </Card>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          gap: 12,
          marginBottom: 24,
        }}
      >
        {[1, 0, 2].map((rank) => {
          const p = allPlayers[rank];
          if (!p) return null;
          const isCenter = rank === 0;
          return (
            <div
              key={rank}
              style={{
                textAlign: 'center',
                animation: 'fadeUp 0.5s ease',
                animationDelay: `${rank * 0.1}s`,
                animationFillMode: 'both',
              }}
            >
              <div style={{ fontSize: isCenter ? 36 : 28, marginBottom: 8 }}>
                {medals[rank]}
              </div>
              <Avatar
                name={p.name}
                size={isCenter ? 56 : 44}
                gradient={
                  p.name === user.name
                    ? activeGame?.bg
                    : AVATAR_COLORS[p.avatar]
                }
                style={{
                  margin: '0 auto 8px',
                  border: p.name === user.name ? '3px solid #fff' : 'none',
                  boxShadow:
                    p.name === user.name
                      ? '0 0 0 2px ' + activeGame?.color
                      : 'none',
                }}
              />
              <div
                style={{
                  fontWeight: 600,
                  fontSize: isCenter ? 15 : 13,
                  maxWidth: 80,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.name === user.name ? 'Sen' : p.name}
              </div>
              <div
                style={{
                  fontFamily: "'Sora', sans-serif",
                  fontWeight: 800,
                  fontSize: isCenter ? 20 : 16,
                  color: activeGame?.color,
                }}
              >
                {p.wins}
              </div>
            </div>
          );
        })}
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {allPlayers.map((p, i) => {
          const winRate =
            p.played > 0 ? Math.round((p.wins / p.played) * 100) : 0;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 20px',
                borderBottom:
                  i < allPlayers.length - 1
                    ? '1px solid var(--border)'
                    : 'none',
                background:
                  p.name === user.name
                    ? activeGame?.color + '10'
                    : 'transparent',
                animation: 'fadeUp 0.3s ease',
                animationDelay: `${i * 0.04}s`,
                animationFillMode: 'both',
              }}
            >
              <span
                style={{
                  fontFamily: "'Sora', sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  color: i < 3 ? activeGame?.color : 'var(--text-secondary)',
                  width: 28,
                  textAlign: 'center',
                }}
              >
                {i < 3 ? medals[i] : `#${i + 1}`}
              </span>
              <Avatar
                name={p.name}
                size={36}
                gradient={
                  p.name === user.name
                    ? activeGame?.bg
                    : AVATAR_COLORS[p.avatar || 0]
                }
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: p.name === user.name ? 700 : 500,
                    fontSize: 15,
                  }}
                >
                  {p.name}
                  {p.name === user.name ? ' (Sen)' : ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {p.played} oyun • %{winRate} kazanma
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontFamily: "'Sora', sans-serif",
                    fontWeight: 700,
                    fontSize: 16,
                    color: activeGame?.color,
                  }}
                >
                  {p.wins}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  galibiyet
                </div>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
};

// ============================================================
// LOBBY
// ============================================================
const Lobby = ({ onSelectGame, onJoinRoom, user, stats }) => {
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setJoinError('Geçerli bir masa kodu girin');
      return;
    }
    setJoinError('');
    onJoinRoom(code);
  };
  const totalGames = Object.values(stats.games).reduce(
    (a, g) => a + g.played,
    0
  );
  const totalWins = Object.values(stats.games).reduce((a, g) => a + g.wins, 0);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ marginBottom: 24, animation: 'fadeUp 0.4s ease' }}>
        <h1
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 'clamp(24px, 5vw, 36px)',
            fontWeight: 700,
            letterSpacing: '-1px',
            marginBottom: 6,
          }}
        >
          Merhaba, {user.name} 👋
        </h1>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            color: 'var(--text-secondary)',
            fontSize: 14,
          }}
        >
          <span>🎮 {totalGames} oyun</span>
          <span>🏆 {totalWins} galibiyet</span>
        </div>
      </div>

      <Card
        style={{
          marginBottom: 24,
          animation: 'fadeUp 0.45s ease',
          background: showJoin
            ? 'var(--surface)'
            : 'linear-gradient(135deg, #1A1A2E 0%, #2D2D44 100%)',
          color: showJoin ? 'var(--text)' : '#fff',
          border: showJoin
            ? '1px solid var(--border)'
            : '1px solid transparent',
        }}
      >
        {!showJoin ? (
          <div
            onClick={() => setShowJoin(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                }}
              >
                🎮
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "'Sora', sans-serif",
                    fontWeight: 700,
                    fontSize: 17,
                  }}
                >
                  Masaya Katıl
                </div>
                <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>
                  Arkadaşının masa kodunu gir
                </div>
              </div>
            </div>
            <div style={{ fontSize: 22, opacity: 0.5 }}>→</div>
          </div>
        ) : (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontFamily: "'Sora', sans-serif",
                  fontWeight: 700,
                  fontSize: 17,
                }}
              >
                🎮 Masa Kodunu Gir
              </div>
              <button
                onClick={() => {
                  setShowJoin(false);
                  setJoinCode('');
                  setJoinError('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 18,
                  color: 'var(--text-secondary)',
                  padding: 4,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Örn: A3BX9K"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase());
                  setJoinError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                maxLength={8}
                style={{
                  flex: 1,
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: joinError
                    ? '2px solid #E63946'
                    : '1px solid var(--border)',
                  fontSize: 18,
                  outline: 'none',
                  fontFamily: "'Sora', sans-serif",
                  fontWeight: 700,
                  letterSpacing: 4,
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                }}
                autoFocus
              />
              <Button
                onClick={handleJoin}
                style={{ padding: '14px 28px', fontSize: 16 }}
              >
                Katıl
              </Button>
            </div>
            {joinError && (
              <p
                style={{
                  color: '#E63946',
                  fontSize: 13,
                  marginTop: 8,
                  animation: 'shake 0.3s ease',
                }}
              >
                {joinError}
              </p>
            )}
          </div>
        )}
      </Card>

      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 14,
        }}
      >
        Oyunlar
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
          gap: 16,
        }}
      >
        {GAMES.map((game, i) => (
          <Card
            key={game.id}
            onClick={() => onSelectGame(game)}
            hoverable
            style={{
              padding: 0,
              overflow: 'hidden',
              animation: 'fadeUp 0.5s ease',
              animationDelay: `${(i + 1) * 0.1}s`,
              animationFillMode: 'both',
            }}
          >
            <div
              style={{
                background: game.bg,
                padding: '28px 20px',
                color: '#fff',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  right: -10,
                  top: -10,
                  fontSize: 80,
                  opacity: 0.15,
                  fontWeight: 800,
                }}
              >
                {game.icon}
              </div>
              <span
                style={{
                  fontSize: 32,
                  display: 'block',
                  marginBottom: 4,
                  animation: 'float 3s ease-in-out infinite',
                  animationDelay: `${i * 0.5}s`,
                }}
              >
                {game.icon}
              </span>
            </div>
            <div style={{ padding: '14px 18px' }}>
              <h3
                style={{
                  fontFamily: "'Sora', sans-serif",
                  fontSize: 17,
                  fontWeight: 700,
                  marginBottom: 3,
                }}
              >
                {game.name}
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                {game.desc}
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 10,
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  👤 {game.players === 1 ? 'Tek' : `${game.players} kişi`}
                </span>
                {stats.games[game.id]?.played > 0 && (
                  <span
                    style={{ fontSize: 11, color: game.color, fontWeight: 600 }}
                  >
                    {stats.games[game.id].wins}G / {stats.games[game.id].losses}
                    M
                  </span>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// ROOM LOBBY
// ============================================================
const RoomLobby = ({ game, roomId, players, onStart, onCopyLink }) => (
  <div
    style={{
      maxWidth: 500,
      margin: '0 auto',
      padding: '48px 20px',
      animation: 'scaleIn 0.4s ease',
      textAlign: 'center',
    }}
  >
    <div
      style={{
        width: 72,
        height: 72,
        borderRadius: 20,
        background: game.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 32,
        margin: '0 auto 20px',
      }}
    >
      {game.icon}
    </div>
    <h2
      style={{
        fontFamily: "'Sora', sans-serif",
        fontSize: 28,
        fontWeight: 700,
        marginBottom: 8,
      }}
    >
      {game.name}
    </h2>
    <Card style={{ marginTop: 24, marginBottom: 24, padding: 20 }}>
      <div
        style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          marginBottom: 8,
        }}
      >
        Masa Kodu
      </div>
      <span
        style={{
          fontFamily: "'Sora', sans-serif",
          fontSize: 32,
          fontWeight: 800,
          letterSpacing: 6,
          color: game.color,
        }}
      >
        {roomId}
      </span>
      <Button
        variant="secondary"
        onClick={onCopyLink}
        style={{ marginTop: 16, width: '100%' }}
      >
        📋 Davet Linkini Kopyala
      </Button>
    </Card>
    <Card style={{ padding: 20 }}>
      <div
        style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          marginBottom: 16,
        }}
      >
        Oyuncular ({players.length}/{game.players})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {players.map((p, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 16px',
              background: 'var(--surface-hover)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <Avatar name={p} size={32} />
            <span style={{ fontWeight: 500, fontSize: 15 }}>{p}</span>
            {i === 0 && (
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  padding: '2px 8px',
                  background: game.bg,
                  color: '#fff',
                  borderRadius: 20,
                  fontWeight: 600,
                }}
              >
                HOST
              </span>
            )}
          </div>
        ))}
        {Array.from({ length: game.players - players.length }).map((_, i) => (
          <div
            key={`e-${i}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 16px',
              borderRadius: 'var(--radius-sm)',
              border: '2px dashed var(--border)',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: '2px dashed var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
              }}
            >
              ?
            </div>
            <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Bekleniyor...
            </span>
          </div>
        ))}
      </div>
    </Card>
    {game.players === 1 || players.length >= game.players ? (
      <Button
        onClick={onStart}
        style={{
          marginTop: 24,
          width: '100%',
          padding: '16px',
          fontSize: 16,
          background: game.bg,
        }}
      >
        ▶ Oyunu Başlat
      </Button>
    ) : (
      <p
        style={{ marginTop: 24, color: 'var(--text-secondary)', fontSize: 14 }}
      >
        Oyuncular bekleniyor...
      </p>
    )}
    {game.players > 1 && players.length < game.players && (
      <Button
        variant="ghost"
        onClick={onStart}
        style={{ marginTop: 8, fontSize: 13 }}
      >
        Bot ile başlat (Demo)
      </Button>
    )}
  </div>
);

// ============================================================
// XOX GAME
// ============================================================
const XOXGame = ({ game, players, onGameEnd, soundOn }) => {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [isX, setIsX] = useState(true);
  const [winner, setWinner] = useState(null);
  const [winLine, setWinLine] = useState(null);
  const [scores, setScores] = useState({ x: 0, o: 0, draw: 0 });
  const [showConfetti, setShowConfetti] = useState(false);
  const checkWinner = useCallback((b) => {
    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];
    for (const [a, bb, c] of lines) {
      if (b[a] && b[a] === b[bb] && b[a] === b[c])
        return { winner: b[a], line: [a, bb, c] };
    }
    if (b.every(Boolean)) return { winner: 'draw', line: null };
    return null;
  }, []);
  const handleClick = (i) => {
    if (board[i] || winner) return;
    if (soundOn) playSound('place');
    const nb = [...board];
    nb[i] = isX ? 'X' : 'O';
    setBoard(nb);
    const r = checkWinner(nb);
    if (r) {
      setWinner(r.winner);
      setWinLine(r.line);
      if (r.winner === 'draw') {
        setScores((s) => ({ ...s, draw: s.draw + 1 }));
        onGameEnd('draw');
      } else if (r.winner === 'X') {
        setScores((s) => ({ ...s, x: s.x + 1 }));
        onGameEnd('win');
        if (soundOn) playSound('win');
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2000);
      } else {
        setScores((s) => ({ ...s, o: s.o + 1 }));
        onGameEnd('loss');
        if (soundOn) playSound('lose');
      }
    }
    setIsX(!isX);
  };
  const reset = () => {
    setBoard(Array(9).fill(null));
    setIsX(true);
    setWinner(null);
    setWinLine(null);
  };

  return (
    <div
      style={{
        maxWidth: 440,
        margin: '0 auto',
        padding: '24px 20px',
        animation: 'fadeUp 0.4s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 24,
          marginBottom: 28,
          textAlign: 'center',
        }}
      >
        {[
          {
            label: players[0] || 'X',
            score: scores.x,
            color: '#E63946',
            active: isX && !winner,
          },
          {
            label: 'Berabere',
            score: scores.draw,
            color: 'var(--text-secondary)',
          },
          {
            label: players[1] || 'O',
            score: scores.o,
            color: '#457B9D',
            active: !isX && !winner,
          },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              padding: '12px 20px',
              borderRadius: 'var(--radius-sm)',
              background: s.active ? 'var(--surface)' : 'transparent',
              boxShadow: s.active ? 'var(--shadow)' : 'none',
              transition: 'var(--transition)',
              minWidth: 80,
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                marginBottom: 4,
                fontWeight: 500,
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 28,
                fontWeight: 800,
                color: s.color,
              }}
            >
              {s.score}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          maxWidth: 320,
          margin: '0 auto',
        }}
      >
        {board.map((cell, i) => (
          <button
            key={i}
            onClick={() => handleClick(i)}
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: 'var(--radius-sm)',
              border: '2px solid var(--border)',
              background: winLine?.includes(i)
                ? winner === 'X'
                  ? '#FEE2E2'
                  : '#DBEAFE'
                : 'var(--surface)',
              cursor: cell || winner ? 'default' : 'pointer',
              fontSize: 'clamp(28px, 8vw, 48px)',
              fontFamily: "'Sora', sans-serif",
              fontWeight: 800,
              color: cell === 'X' ? '#E63946' : '#457B9D',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: cell ? 'scaleIn 0.2s ease' : 'none',
            }}
          >
            {cell}
          </button>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginTop: 28 }}>
        {winner ? (
          <div style={{ animation: 'bounceIn 0.5s ease' }}>
            <p
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 22,
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              {winner === 'draw'
                ? 'Berabere! 🤝'
                : `${
                    winner === 'X' ? players[0] || 'X' : players[1] || 'O'
                  } Kazandı! 🎉`}
            </p>
            <Button onClick={reset} style={{ background: game.bg }}>
              Tekrar Oyna
            </Button>
          </div>
        ) : (
          <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
            Sıra:{' '}
            <strong style={{ color: isX ? '#E63946' : '#457B9D' }}>
              {isX ? players[0] || 'X' : players[1] || 'O'}
            </strong>
          </p>
        )}
      </div>
      <Confetti active={showConfetti} color={game.color} />
    </div>
  );
};

// ============================================================
// MINESWEEPER GAME
// ============================================================
const MinesweeperGame = ({ game, onGameEnd, soundOn, dark }) => {
  const ROWS = 9,
    COLS = 9,
    MINES = 10;
  const initBoard = useCallback(() => {
    const cells = Array.from({ length: ROWS * COLS }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      adjacent: 0,
    }));
    const mineIdx = new Set();
    while (mineIdx.size < MINES)
      mineIdx.add(Math.floor(Math.random() * ROWS * COLS));
    mineIdx.forEach((i) => {
      cells[i].mine = true;
    });
    cells.forEach((cell, i) => {
      if (cell.mine) return;
      const r = Math.floor(i / COLS),
        c = i % COLS;
      let cnt = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr,
            nc = c + dc;
          if (
            nr >= 0 &&
            nr < ROWS &&
            nc >= 0 &&
            nc < COLS &&
            cells[nr * COLS + nc].mine
          )
            cnt++;
        }
      cell.adjacent = cnt;
    });
    return cells;
  }, []);
  const [cells, setCells] = useState(() => initBoard());
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [time, setTime] = useState(0);
  const [started, setStarted] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => {
    if (started && !gameOver && !won)
      timerRef.current = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [started, gameOver, won]);
  const reveal = (idx, nc) => {
    if (nc[idx].revealed || nc[idx].flagged) return;
    nc[idx].revealed = true;
    if (nc[idx].adjacent === 0 && !nc[idx].mine) {
      const r = Math.floor(idx / COLS),
        c = idx % COLS;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr,
            ncc = c + dc;
          if (nr >= 0 && nr < ROWS && ncc >= 0 && ncc < COLS)
            reveal(nr * COLS + ncc, nc);
        }
    }
  };
  const handleClick = (idx) => {
    if (gameOver || won || cells[idx].flagged) return;
    if (!started) setStarted(true);
    if (soundOn) playSound('click');
    const nc = cells.map((c) => ({ ...c }));
    if (nc[idx].mine) {
      nc.forEach((c) => {
        if (c.mine) c.revealed = true;
      });
      setCells(nc);
      setGameOver(true);
      clearInterval(timerRef.current);
      if (soundOn) playSound('explode');
      onGameEnd('loss');
      return;
    }
    reveal(idx, nc);
    setCells(nc);
    if (nc.filter((c) => !c.mine).every((c) => c.revealed)) {
      setWon(true);
      clearInterval(timerRef.current);
      if (soundOn) playSound('win');
      onGameEnd('win');
    }
  };
  const handleRC = (e, idx) => {
    e.preventDefault();
    if (gameOver || won || cells[idx].revealed) return;
    if (soundOn) playSound('flip');
    const nc = cells.map((c) => ({ ...c }));
    nc[idx].flagged = !nc[idx].flagged;
    setCells(nc);
  };
  const reset = () => {
    setCells(initBoard());
    setGameOver(false);
    setWon(false);
    setTime(0);
    setStarted(false);
    clearInterval(timerRef.current);
  };
  const flagCount = cells.filter((c) => c.flagged).length;
  const colors = [
    '',
    '#2563EB',
    '#16A34A',
    '#DC2626',
    '#7C3AED',
    '#B91C1C',
    '#0891B2',
    '#1A1A2E',
    '#6B7280',
  ];

  return (
    <div
      style={{
        maxWidth: 500,
        margin: '0 auto',
        padding: '24px 20px',
        animation: 'fadeUp 0.4s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          padding: '12px 16px',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            fontFamily: "'Sora', sans-serif",
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          💣 {MINES - flagCount}
        </div>
        <Button
          variant="secondary"
          onClick={reset}
          style={{ padding: '8px 16px', fontSize: 13 }}
        >
          🔄 Yeni
        </Button>
        <div
          style={{
            fontFamily: "'Sora', sans-serif",
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          ⏱ {time}s
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gap: 2,
          maxWidth: 380,
          margin: '0 auto',
          userSelect: 'none',
        }}
      >
        {cells.map((cell, i) => (
          <button
            key={i}
            onClick={() => handleClick(i)}
            onContextMenu={(e) => handleRC(e, i)}
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: 4,
              border: 'none',
              background: cell.revealed
                ? cell.mine
                  ? dark
                    ? '#4A1A1A'
                    : '#FEE2E2'
                  : dark
                  ? '#252540'
                  : '#F3F4F6'
                : 'var(--surface)',
              boxShadow: cell.revealed
                ? 'none'
                : dark
                ? 'inset 0 -2px 0 rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.15)'
                : 'inset 0 -2px 0 rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
              cursor: gameOver || won ? 'default' : 'pointer',
              fontSize: 'clamp(11px, 3vw, 16px)',
              fontWeight: 700,
              fontFamily: "'Sora', sans-serif",
              color: cell.mine ? '#DC2626' : colors[cell.adjacent],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {cell.revealed
              ? cell.mine
                ? '💣'
                : cell.adjacent || ''
              : cell.flagged
              ? '🚩'
              : ''}
          </button>
        ))}
      </div>
      <p
        style={{
          textAlign: 'center',
          marginTop: 12,
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}
      >
        💡 Bayrak: sağ tık veya uzun basın
      </p>
      {(gameOver || won) && (
        <div
          style={{
            textAlign: 'center',
            marginTop: 24,
            animation: 'scaleIn 0.3s ease',
          }}
        >
          <p
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 22,
              fontWeight: 700,
              marginBottom: 16,
            }}
          >
            {won ? 'Tebrikler! 🎉' : 'Patladı! 💥'}
          </p>
          <Button onClick={reset} style={{ background: game.bg }}>
            Tekrar Oyna
          </Button>
        </div>
      )}
    </div>
  );
};

// ============================================================
// RPS GAME
// ============================================================
const RPSGame = ({ game, players, onGameEnd, soundOn }) => {
  const CHOICES = [
    { id: 'rock', emoji: '✊', name: 'Taş', beats: 'scissors' },
    { id: 'paper', emoji: '✋', name: 'Kağıt', beats: 'rock' },
    { id: 'scissors', emoji: '✌️', name: 'Makas', beats: 'paper' },
  ];
  const [p1Choice, setP1Choice] = useState(null);
  const [p2Choice, setP2Choice] = useState(null);
  const [scores, setScores] = useState([0, 0]);
  const [round, setRound] = useState(1);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [gameWinner, setGameWinner] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const play = (choice) => {
    if (showResult) return;
    if (soundOn) playSound('place');
    const bot = CHOICES[Math.floor(Math.random() * 3)];
    setP1Choice(choice);
    setP2Choice(bot);
    setShowResult(true);
    let res =
      choice.id === bot.id ? 'draw' : choice.beats === bot.id ? 'p1' : 'p2';
    setResult(res);
    if (soundOn)
      setTimeout(
        () =>
          playSound(res === 'p1' ? 'match' : res === 'p2' ? 'lose' : 'click'),
        300
      );
    const ns = [...scores];
    if (res === 'p1') ns[0]++;
    else if (res === 'p2') ns[1]++;
    setScores(ns);
    if (ns[0] >= 3 || ns[1] >= 3) {
      const w = ns[0] >= 3 ? 0 : 1;
      setTimeout(() => {
        setGameWinner(w);
        onGameEnd(w === 0 ? 'win' : 'loss');
        if (w === 0 && soundOn) playSound('win');
        if (w === 0) {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 2000);
        }
      }, 1500);
    }
  };
  const nextRound = () => {
    setP1Choice(null);
    setP2Choice(null);
    setResult(null);
    setShowResult(false);
    setRound((r) => r + 1);
  };
  const reset = () => {
    setP1Choice(null);
    setP2Choice(null);
    setScores([0, 0]);
    setRound(1);
    setResult(null);
    setShowResult(false);
    setGameWinner(null);
  };

  return (
    <div
      style={{
        maxWidth: 480,
        margin: '0 auto',
        padding: '24px 20px',
        animation: 'fadeUp 0.4s ease',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 14,
          color: 'var(--text-secondary)',
          marginBottom: 8,
        }}
      >
        Raund {round} • İlk 3'e ulaşan kazanır
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 32,
          marginBottom: 32,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
            {players[0] || 'Sen'}
          </div>
          <div
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 40,
              fontWeight: 800,
              color: '#2A9D8F',
            }}
          >
            {scores[0]}
          </div>
        </div>
        <div
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 20,
            fontWeight: 300,
            color: 'var(--text-secondary)',
          }}
        >
          vs
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
            {players[1] || 'Bot'}
          </div>
          <div
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 40,
              fontWeight: 800,
              color: '#E63946',
            }}
          >
            {scores[1]}
          </div>
        </div>
      </div>
      {showResult && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 32,
            marginBottom: 32,
            animation: 'scaleIn 0.3s ease',
          }}
        >
          <div
            style={{
              fontSize: 64,
              animation: 'pulse 0.6s ease',
              filter: result === 'p2' ? 'grayscale(0.5)' : 'none',
            }}
          >
            {p1Choice?.emoji}
          </div>
          <div
            style={{
              fontFamily: "'Sora', sans-serif",
              fontWeight: 800,
              fontSize: 20,
              color:
                result === 'draw'
                  ? 'var(--text-secondary)'
                  : result === 'p1'
                  ? '#2A9D8F'
                  : '#E63946',
            }}
          >
            {result === 'draw' ? '=' : result === 'p1' ? '>' : '<'}
          </div>
          <div
            style={{
              fontSize: 64,
              animation: 'pulse 0.6s ease',
              filter: result === 'p1' ? 'grayscale(0.5)' : 'none',
            }}
          >
            {p2Choice?.emoji}
          </div>
        </div>
      )}
      {showResult && (
        <div
          style={{
            marginBottom: 24,
            fontFamily: "'Sora', sans-serif",
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          {result === 'draw'
            ? 'Berabere! 🤝'
            : result === 'p1'
            ? 'Kazandın! ✨'
            : 'Kaybettin! 😤'}
        </div>
      )}
      {!showResult && !gameWinner && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          {CHOICES.map((c) => (
            <button
              key={c.id}
              onClick={() => play(c)}
              style={{
                width: 100,
                height: 100,
                borderRadius: 'var(--radius)',
                border: '2px solid var(--border)',
                background: 'var(--surface)',
                cursor: 'pointer',
                fontSize: 48,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                transition: 'var(--transition)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.08)';
                e.currentTarget.style.borderColor = game.color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <span>{c.emoji}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                {c.name}
              </span>
            </button>
          ))}
        </div>
      )}
      {showResult && !gameWinner && (
        <Button onClick={nextRound} style={{ background: game.bg }}>
          Sonraki Raund →
        </Button>
      )}
      {gameWinner !== null && (
        <div style={{ animation: 'bounceIn 0.5s ease' }}>
          <div
            style={{
              fontSize: 48,
              marginBottom: 12,
              animation: 'pulse 1s ease infinite',
            }}
          >
            🏆
          </div>
          <p
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 24,
              fontWeight: 700,
              marginBottom: 20,
            }}
          >
            {gameWinner === 0
              ? `${players[0] || 'Sen'} Kazandı!`
              : `${players[1] || 'Bot'} Kazandı!`}
          </p>
          <Button onClick={reset} style={{ background: game.bg }}>
            Tekrar Oyna
          </Button>
        </div>
      )}
      <Confetti active={showConfetti} color={game.color} />
    </div>
  );
};

// ============================================================
// MEMORY GAME
// ============================================================
const CARD_EMOJIS = ['🍎', '🍋', '🍇', '🍊', '🌸', '🌈', '⭐', '🎯'];
const MemoryGame = ({ game, onGameEnd, soundOn }) => {
  const initCards = useCallback(() => {
    const pairs = [...CARD_EMOJIS, ...CARD_EMOJIS];
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    return pairs.map((emoji, i) => ({
      id: i,
      emoji,
      flipped: false,
      matched: false,
    }));
  }, []);

  const [cards, setCards] = useState(() => initCards());
  const [flipped, setFlipped] = useState([]);
  const [moves, setMoves] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [won, setWon] = useState(false);
  const [time, setTime] = useState(0);
  const [started, setStarted] = useState(false);
  const timerRef = useRef(null);
  const lockRef = useRef(false);

  useEffect(() => {
    if (started && !won)
      timerRef.current = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [started, won]);

  const handleFlip = (idx) => {
    if (
      lockRef.current ||
      cards[idx].flipped ||
      cards[idx].matched ||
      flipped.length >= 2
    )
      return;
    if (!started) setStarted(true);
    if (soundOn) playSound('flip');
    const nc = cards.map((c) => ({ ...c }));
    nc[idx].flipped = true;
    setCards(nc);
    const newFlipped = [...flipped, idx];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setMoves((m) => m + 1);
      lockRef.current = true;
      const [a, b] = newFlipped;
      if (nc[a].emoji === nc[b].emoji) {
        if (soundOn) setTimeout(() => playSound('match'), 200);
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c, i) =>
              i === a || i === b ? { ...c, matched: true } : c
            )
          );
          const nm = matchCount + 1;
          setMatchCount(nm);
          if (nm === CARD_EMOJIS.length) {
            setWon(true);
            clearInterval(timerRef.current);
            onGameEnd('win');
            if (soundOn) playSound('win');
          }
          setFlipped([]);
          lockRef.current = false;
        }, 400);
      } else {
        if (soundOn) setTimeout(() => playSound('lose'), 400);
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c, i) =>
              i === a || i === b ? { ...c, flipped: false } : c
            )
          );
          setFlipped([]);
          lockRef.current = false;
        }, 800);
      }
    }
  };

  const reset = () => {
    setCards(initCards());
    setFlipped([]);
    setMoves(0);
    setMatchCount(0);
    setWon(false);
    setTime(0);
    setStarted(false);
    lockRef.current = false;
    clearInterval(timerRef.current);
  };

  const stars = moves <= 10 ? 3 : moves <= 16 ? 2 : 1;

  return (
    <div
      style={{
        maxWidth: 440,
        margin: '0 auto',
        padding: '24px 20px',
        animation: 'fadeUp 0.4s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          padding: '12px 16px',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            fontFamily: "'Sora', sans-serif",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          🎯 {moves} hamle
        </div>
        <Button
          variant="secondary"
          onClick={reset}
          style={{ padding: '8px 16px', fontSize: 13 }}
        >
          🔄 Yeni
        </Button>
        <div
          style={{
            fontFamily: "'Sora', sans-serif",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          ⏱ {time}s
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          maxWidth: 360,
          margin: '0 auto',
        }}
      >
        {cards.map((card, i) => (
          <button
            key={card.id}
            onClick={() => handleFlip(i)}
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: 'var(--radius-sm)',
              border: '2px solid',
              borderColor: card.matched
                ? '#A78BFA'
                : card.flipped
                ? game.color
                : 'var(--border)',
              background:
                card.flipped || card.matched
                  ? card.matched
                    ? 'var(--surface-hover)'
                    : 'var(--surface)'
                  : game.bg,
              cursor: card.flipped || card.matched ? 'default' : 'pointer',
              fontSize: 'clamp(24px, 7vw, 36px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease',
              opacity: card.matched ? 0.7 : 1,
            }}
          >
            {card.flipped || card.matched ? (
              <span style={{ animation: 'scaleIn 0.25s ease' }}>
                {card.emoji}
              </span>
            ) : (
              <span
                style={{
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: 'clamp(18px, 5vw, 24px)',
                }}
              >
                ?
              </span>
            )}
          </button>
        ))}
      </div>

      <div
        style={{
          textAlign: 'center',
          marginTop: 16,
          fontSize: 13,
          color: 'var(--text-secondary)',
        }}
      >
        {matchCount}/{CARD_EMOJIS.length} eşleşme bulundu
      </div>

      {won && (
        <div
          style={{
            textAlign: 'center',
            marginTop: 24,
            animation: 'scaleIn 0.4s ease',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>
            {'⭐'.repeat(stars)}
            {'☆'.repeat(3 - stars)}
          </div>
          <p
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 22,
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Tebrikler! 🎉
          </p>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            {moves} hamlede, {time} saniyede tamamladın
          </p>
          <Button onClick={reset} style={{ background: game.bg }}>
            Tekrar Oyna
          </Button>
        </div>
      )}
    </div>
  );
};

// ============================================================
// SNAKE GAME
// ============================================================
const GRID = 20;
const SnakeGame = ({ game, onGameEnd, soundOn, dark }) => {
  const canvasRef = useRef(null);
  const [gameState, setGameState] = useState('idle');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const snakeRef = useRef([{ x: 10, y: 10 }]);
  const dirRef = useRef({ x: 1, y: 0 });
  const nextDirRef = useRef({ x: 1, y: 0 });
  const foodRef = useRef({ x: 15, y: 10 });
  const loopRef = useRef(null);
  const scoreRef = useRef(0);
  const gameOverRef = useRef(false);
  const onGameEndRef = useRef(onGameEnd);
  onGameEndRef.current = onGameEnd;
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const darkRef = useRef(dark);
  darkRef.current = dark;

  const spawnFood = useCallback(() => {
    let f;
    do {
      f = {
        x: Math.floor(Math.random() * GRID),
        y: Math.floor(Math.random() * GRID),
      };
    } while (snakeRef.current.some((s) => s.x === f.x && s.y === f.y));
    foodRef.current = f;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width / GRID;
    ctx.fillStyle = darkRef.current ? '#1A1A2E' : '#F8FAFC';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = darkRef.current ? '#2A2A45' : '#E5E7EB';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * size, 0);
      ctx.lineTo(i * size, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * size);
      ctx.lineTo(canvas.width, i * size);
      ctx.stroke();
    }
    const snake = snakeRef.current;
    snake.forEach((seg, i) => {
      const ratio = 1 - (i / snake.length) * 0.4;
      const r = Math.round(5 * ratio + 150 * (1 - ratio));
      const g = Math.round(150 * ratio + 211 * (1 - ratio));
      const b = Math.round(105 * ratio + 153 * (1 - ratio));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      const pad = i === 0 ? 1 : 2;
      ctx.beginPath();
      ctx.roundRect(
        seg.x * size + pad,
        seg.y * size + pad,
        size - pad * 2,
        size - pad * 2,
        i === 0 ? 6 : 4
      );
      ctx.fill();
    });
    const head = snake[0];
    const ex = head.x * size + size * 0.3;
    const ey = head.y * size + size * 0.3;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + size * 0.35, ey, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1A1A2E';
    ctx.beginPath();
    ctx.arc(ex + 1, ey, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + size * 0.35 + 1, ey, 1.5, 0, Math.PI * 2);
    ctx.fill();
    const food = foodRef.current;
    ctx.font = `${size - 4}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🍎', food.x * size + size / 2, food.y * size + size / 2 + 1);
  }, []);

  const gameLoop = useCallback(() => {
    dirRef.current = nextDirRef.current;
    const snake = snakeRef.current;
    const head = {
      x: snake[0].x + dirRef.current.x,
      y: snake[0].y + dirRef.current.y,
    };
    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
      clearInterval(loopRef.current);
      if (!gameOverRef.current) {
        gameOverRef.current = true;
        setGameState('over');
        if (soundOnRef.current) playSound('explode');
        onGameEndRef.current(scoreRef.current >= 5 ? 'win' : 'loss');
      }
      return;
    }
    if (snake.some((s) => s.x === head.x && s.y === head.y)) {
      clearInterval(loopRef.current);
      if (!gameOverRef.current) {
        gameOverRef.current = true;
        setGameState('over');
        if (soundOnRef.current) playSound('explode');
        onGameEndRef.current(scoreRef.current >= 5 ? 'win' : 'loss');
      }
      return;
    }
    const newSnake = [head, ...snake];
    if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
      scoreRef.current++;
      setScore(scoreRef.current);
      setHighScore((h) => Math.max(h, scoreRef.current));
      if (soundOnRef.current) playSound('eat');
      spawnFood();
    } else {
      newSnake.pop();
    }
    snakeRef.current = newSnake;
    draw();
  }, [draw, spawnFood]);

  const startGame = useCallback(() => {
    snakeRef.current = [{ x: 10, y: 10 }];
    dirRef.current = { x: 1, y: 0 };
    nextDirRef.current = { x: 1, y: 0 };
    scoreRef.current = 0;
    gameOverRef.current = false;
    setScore(0);
    spawnFood();
    setGameState('playing');
    draw();
    clearInterval(loopRef.current);
    loopRef.current = setInterval(gameLoop, 120);
  }, [gameLoop, draw, spawnFood]);

  useEffect(() => {
    return () => clearInterval(loopRef.current);
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (gameState !== 'playing') return;
      const d = dirRef.current;
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
          if (d.y !== 1) nextDirRef.current = { x: 0, y: -1 };
          break;
        case 'ArrowDown':
        case 's':
          if (d.y !== -1) nextDirRef.current = { x: 0, y: 1 };
          break;
        case 'ArrowLeft':
        case 'a':
          if (d.x !== 1) nextDirRef.current = { x: -1, y: 0 };
          break;
        case 'ArrowRight':
        case 'd':
          if (d.x !== -1) nextDirRef.current = { x: 1, y: 0 };
          break;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [gameState]);

  const touchStart = useRef(null);
  const handleTouchStart = (e) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e) => {
    if (!touchStart.current || gameState !== 'playing') return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    const d = dirRef.current;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 20 && d.x !== -1) nextDirRef.current = { x: 1, y: 0 };
      else if (dx < -20 && d.x !== 1) nextDirRef.current = { x: -1, y: 0 };
    } else {
      if (dy > 20 && d.y !== -1) nextDirRef.current = { x: 0, y: 1 };
      else if (dy < -20 && d.y !== 1) nextDirRef.current = { x: 0, y: -1 };
    }
    touchStart.current = null;
  };

  useEffect(() => {
    if (gameState === 'idle') draw();
  }, [gameState, draw]);

  const canvasSize = Math.min(
    380,
    typeof window !== 'undefined' ? window.innerWidth - 40 : 380
  );

  return (
    <div
      style={{
        maxWidth: 440,
        margin: '0 auto',
        padding: '24px 20px',
        animation: 'fadeUp 0.4s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          padding: '12px 16px',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            fontFamily: "'Sora', sans-serif",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          🍎 {score}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          En yüksek: {highScore}
        </div>
      </div>
      <div
        style={{
          position: 'relative',
          margin: '0 auto',
          width: canvasSize,
          height: canvasSize,
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize}
          height={canvasSize}
          style={{
            borderRadius: 'var(--radius-sm)',
            border: '2px solid var(--border)',
            display: 'block',
          }}
        />
        {gameState !== 'playing' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: dark
                ? 'rgba(15,15,23,0.92)'
                : 'rgba(255,255,255,0.9)',
              borderRadius: 'var(--radius-sm)',
              animation: 'scaleIn 0.3s ease',
            }}
          >
            {gameState === 'over' && (
              <>
                <div style={{ fontSize: 48, marginBottom: 8 }}>💀</div>
                <p
                  style={{
                    fontFamily: "'Sora', sans-serif",
                    fontSize: 22,
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  Oyun Bitti!
                </p>
                <p
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: 14,
                    marginBottom: 20,
                  }}
                >
                  Skor: {score}
                </p>
              </>
            )}
            {gameState === 'idle' && (
              <>
                <div
                  style={{
                    fontSize: 48,
                    marginBottom: 8,
                    animation: 'float 2s ease-in-out infinite',
                  }}
                >
                  🐍
                </div>
                <p
                  style={{
                    fontFamily: "'Sora', sans-serif",
                    fontSize: 18,
                    fontWeight: 600,
                    marginBottom: 20,
                    color: 'var(--text-secondary)',
                  }}
                >
                  Hazır mısın?
                </p>
              </>
            )}
            <Button
              onClick={startGame}
              style={{
                background: game.bg,
                padding: '14px 32px',
                fontSize: 16,
              }}
            >
              {gameState === 'over' ? 'Tekrar Oyna' : '▶ Başla'}
            </Button>
          </div>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: 20,
          gap: 4,
        }}
      >
        <button
          onClick={() => {
            if (gameState === 'playing' && dirRef.current.y !== 1)
              nextDirRef.current = { x: 0, y: -1 };
          }}
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            fontSize: 22,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ↑
        </button>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => {
              if (gameState === 'playing' && dirRef.current.x !== 1)
                nextDirRef.current = { x: -1, y: 0 };
            }}
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              fontSize: 22,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ←
          </button>
          <div style={{ width: 56, height: 56 }} />
          <button
            onClick={() => {
              if (gameState === 'playing' && dirRef.current.x !== -1)
                nextDirRef.current = { x: 1, y: 0 };
            }}
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              fontSize: 22,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            →
          </button>
        </div>
        <button
          onClick={() => {
            if (gameState === 'playing' && dirRef.current.y !== -1)
              nextDirRef.current = { x: 0, y: 1 };
          }}
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            fontSize: 22,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ↓
        </button>
      </div>
      <p
        style={{
          textAlign: 'center',
          marginTop: 10,
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}
      >
        💡 Yön tuşları, WASD veya ekrana kaydır
      </p>
    </div>
  );
};

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('login');
  const [selectedGame, setSelectedGame] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [toast, setToast] = useState({ message: '', visible: false });
  const [soundOn, setSoundOn] = useState(true);
  const [dark, setDark] = useState(false);
  const [stats, setStats] = useState({
    games: {
      xox: { played: 3, wins: 2, losses: 1 },
      minesweeper: { played: 5, wins: 3, losses: 2 },
      rps: { played: 4, wins: 1, losses: 3 },
      memory: { played: 0, wins: 0, losses: 0 },
      snake: { played: 0, wins: 0, losses: 0 },
    },
    history: [
      { gameId: 'xox', result: 'win' },
      { gameId: 'minesweeper', result: 'loss' },
      { gameId: 'rps', result: 'loss' },
      { gameId: 'xox', result: 'win' },
      { gameId: 'minesweeper', result: 'win' },
    ],
  });

  const showToast = (msg) => {
    setToast({ message: msg, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  };

  const handleGameEnd = (result) => {
    if (!selectedGame) return;
    setStats((prev) => {
      const gid = selectedGame.id;
      const gs = { ...(prev.games[gid] || { played: 0, wins: 0, losses: 0 }) };
      gs.played++;
      if (result === 'win') gs.wins++;
      else if (result === 'loss') gs.losses++;
      return {
        games: { ...prev.games, [gid]: gs },
        history: [...prev.history, { gameId: gid, result }],
      };
    });
  };

  const handleLogin = (userData) => {
    setUser(userData);
    setPage('lobby');
  };
  const handleSelectGame = (game) => {
    setSelectedGame(game);
    const id = generateRoomId();
    setRoomId(id);
    setPlayers([user.name]);
    setPage(game.players === 1 ? 'game' : 'room');
  };
  const handleStartGame = () => {
    if (selectedGame.players > 1 && players.length < selectedGame.players)
      setPlayers((p) => [...p, 'Bot 🤖']);
    setPage('game');
  };
  const handleCopyLink = () => {
    const link = `oyun.club/room/${roomId}`;
    if (navigator.clipboard) navigator.clipboard.writeText(link);
    showToast(`Link kopyalandı: ${link}`);
  };
  const handleJoinRoom = (code) => {
    setPage('multiplayer');
    setRoomId(code);
  };
  const handleBack = () => {
    if (page === 'game') {
      if (selectedGame?.players > 1) setPage('room');
      else {
        setPage('lobby');
        setSelectedGame(null);
      }
    } else if (page === 'room') {
      setPage('lobby');
      setSelectedGame(null);
    } else setPage('lobby');
  };
  const handleHome = () => {
    setPage('lobby');
    setSelectedGame(null);
  };

  if (page === 'login' || !user)
    return (
      <>
        <GlobalStyle dark={dark} />
        <LoginPage
          onLogin={handleLogin}
          dark={dark}
          onToggleDark={() => setDark((d) => !d)}
        />
      </>
    );

  const renderGame = () => {
    switch (selectedGame?.id) {
      case 'xox':
        return (
          <XOXGame
            game={selectedGame}
            players={players}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'minesweeper':
        return (
          <MinesweeperGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
            dark={dark}
          />
        );
      case 'rps':
        return (
          <RPSGame
            game={selectedGame}
            players={players}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'memory':
        return (
          <MemoryGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'snake':
        return (
          <SnakeGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
            dark={dark}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <GlobalStyle dark={dark} />
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg)',
          transition: 'background 0.3s ease',
        }}
      >
        <Header
          user={user}
          onBack={handleBack}
          showBack={
            !['lobby', 'profile', 'leaderboard', 'multiplayer'].includes(page)
          }
          onProfile={() => setPage('profile')}
          onLeaderboard={() => setPage('leaderboard')}
          onMultiplayer={() => setPage('multiplayer')}
          onHome={handleHome}
          dark={dark}
          onToggleDark={() => setDark((d) => !d)}
        />
        {page === 'lobby' && (
          <Lobby
            onSelectGame={handleSelectGame}
            onJoinRoom={handleJoinRoom}
            user={user}
            stats={stats}
          />
        )}
        {page === 'profile' && (
          <ProfilePage
            user={user}
            stats={stats}
            onLogout={() => {
              setUser(null);
              setPage('login');
            }}
          />
        )}
        {page === 'leaderboard' && (
          <LeaderboardPage user={user} stats={stats} />
        )}
        {page === 'multiplayer' && (
          <MultiplayerLobby
            initialCode={roomId}
            userName={user ? user.name : ''}
          />
        )}
        {page === 'room' && selectedGame && (
          <RoomLobby
            game={selectedGame}
            roomId={roomId}
            players={players}
            onStart={handleStartGame}
            onCopyLink={handleCopyLink}
          />
        )}
        {page === 'game' && selectedGame && renderGame()}
      </div>
      <Toast message={toast.message} visible={toast.visible} />
      <SoundToggle
        soundOn={soundOn}
        onToggle={() => {
          setSoundOn((s) => !s);
          playSound('click');
        }}
      />
    </>
  );
}

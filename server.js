const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({ limit: '100kb' }));

// 방 목록 (메모리 저장)
const rooms = {};

// 5분 지난 방 자동 청소
setInterval(() => {
  const now = Date.now();
  for (const key in rooms) {
    if (now - rooms[key].created > 5 * 60 * 1000) {
      delete rooms[key];
    }
  }
}, 60 * 1000);

// 방 목록 조회
app.get('/rooms', (req, res) => {
  const list = Object.entries(rooms)
    .filter(([, r]) => r.status === 'waiting')
    .map(([key, r]) => ({ key, nick: r.nick, created: r.created }));
  res.json(list);
});

// 방 만들기
app.post('/rooms', (req, res) => {
  const { nick, offer } = req.body;
  if (!offer) return res.status(400).json({ error: 'offer required' });
  const key = Math.random().toString(36).substr(2, 8).toUpperCase();
  rooms[key] = { nick: nick || '익명', offer, status: 'waiting', created: Date.now() };
  res.json({ key });
});

// 방 조회 (offer 가져오기)
app.get('/rooms/:key', (req, res) => {
  const r = rooms[req.params.key];
  if (!r) return res.status(404).json({ error: 'not found' });
  res.json({ nick: r.nick, offer: r.offer, status: r.status, answer: r.answer || null });
});

// answer 등록 (참가자 → 방장)
app.patch('/rooms/:key', (req, res) => {
  const r = rooms[req.params.key];
  if (!r) return res.status(404).json({ error: 'not found' });
  if (req.body.answer) r.answer = req.body.answer;
  if (req.body.status) r.status = req.body.status;
  res.json({ ok: true });
});

// 방 삭제
app.delete('/rooms/:key', (req, res) => {
  delete rooms[req.params.key];
  res.json({ ok: true });
});

// 헬스체크
app.get('/', (req, res) => res.json({ status: 'ok', rooms: Object.keys(rooms).length }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MTG Signaling Server running on port ${PORT}`));

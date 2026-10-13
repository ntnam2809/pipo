// Web Speech: nhận lệnh tiếng Việt (tùy chọn) + TTS giọng robot. parseCommand là hàm thuần.
export function normalize(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

// [lệnh, regex, tối đa số từ?]: lệnh động tác tay là từ ngắn dễ trùng câu thường ("tôi không rõ", "hi vọng"), nên chỉ nhận khi câu ngắn.
const CMDS = [
  ['sleep', /\b(ngu di|di ngu|ngu thoi)\b/], ['wake', /\b(day di|thuc day|tinh day|day nao)\b/], ['feed', /\b(an khong|doi khong|an gi|an com)\b/],
  ['look', /\b(nhin (tao|anh|day|toi|em))\b/], ['dance', /\b(nhay di|nhay nhot|nhay nao|nhay mua)\b/], ['angry', /\b(gian a|gian khong|gian ha|gian roi)\b/],
  ['salute', /\b(nghiem|tuan lenh|chao co|ro)\b/, 4], ['bye', /\b(tam biet|bye|bai bai|hen gap lai)\b/, 5], ['wave', /\b(xin chao|chao|hello|hi|hey)\b/, 4],
  ['shot', /\b(pang|bang|bum|pew|bum bum|pew pew)\b/, 2],
  ['combo', /\b(dam lien|lien hoan dam|combo)\b/, 4], ['punch', /\b(dam|danh|dam di|dam nao)\b/, 3],
  ['highfive', /\b(dap tay|high five|highfive|hai phai)\b/, 4], ['fistbump', /\b(cung tay|cung nam dam)\b/, 4],
  ['thumbsup', /\b(like|tuyet|gioi|tuyet voi|gioi lam)\b/, 4], ['clap', /\b(vo tay)\b/, 4], ['peekaboo', /\b(u oa)\b/, 3],
];
/** -> {type:'cmd',cmd} | {type:'name'} | {type:'text',text} */
export function parseCommand(text, petName = 'pipo') {
  const n = normalize(text); if (!n) return null;
  const name = normalize(petName);
  const hasName = name && new RegExp(`\\b${name}\\b`).test(n);
  const words = n.split(' ').length;
  for (const [cmd, re, max] of CMDS) if ((!max || words <= max + (hasName ? 1 : 0)) && re.test(n)) return { type: 'cmd', cmd };
  if (hasName && n.split(' ').length <= 3) return { type: 'name' };
  return { type: 'text', text: String(text).trim(), named: hasName };
}

export function createVoiceInput(bus, getName) {
  const S = { id: 'voice', label: 'Giọng nói', status: 'off', rec: null, want: false };
  const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  S.supported = () => !!SR;
  S.start = async () => {
    if (!SR) { S.status = 'unsupported'; return S.status; }
    try {
      const r = (S.rec = new SR()); r.lang = 'vi-VN'; r.continuous = true; r.interimResults = false;
      r.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (!e.results[i].isFinal) continue;
          const text = e.results[i][0].transcript, c = parseCommand(text, getName());
          if (!c) continue;
          if (c.type === 'cmd') bus.emit('voice:cmd', { cmd: c.cmd, text });
          else if (c.type === 'name') bus.emit('voice:name', { text });
          else bus.emit('voice:text', { text, named: c.named });
        }
      };
      r.onerror = (e) => { if (e && (e.error === 'not-allowed' || e.error === 'service-not-allowed')) { S.want = false; S.status = 'denied'; bus.emit('sensor:status', { id: 'voice', status: S.status }); } };
      r.onend = () => { if (S.want) { try { r.start(); } catch { /* đang chạy */ } } };
      S.want = true; r.start(); S.status = 'on';
    } catch { S.status = 'error'; }
    return S.status;
  };
  S.stop = () => { S.want = false; try { if (S.rec) S.rec.stop(); } catch { /* bỏ qua */ } if (S.status === 'on') S.status = 'off'; };
  return S;
}

export function speak(text) {
  try {
    if (typeof speechSynthesis === 'undefined' || !text) return false;
    const u = new SpeechSynthesisUtterance(text); u.lang = 'vi-VN'; u.pitch = 1.9; u.rate = 1.25; speechSynthesis.cancel(); speechSynthesis.speak(u); return true;
  } catch { return false; }
}

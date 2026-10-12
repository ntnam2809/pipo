# Pipo — Robot Pet Eyes

Biến smartphone thành một con pet robot chỉ có **đôi mắt và một cái miệng nhỏ**, dễ thương, nhiều biểu cảm, phản ứng với cảm biến của điện thoại. Ứng dụng **độc lập, ngoài NeutrinoVerse** (không áp luật lore). Thiết kế đầy đủ: [`DESIGN.md`](DESIGN.md).

PWA thuần: HTML + ES module + Canvas 2D + WebAudio. **Không framework, không bundler, không npm dependency, không file ảnh/âm thanh** — mắt, miệng, hạt hiệu ứng và tiếng bíp đều vẽ/tổng hợp bằng code. LLM là **tùy chọn**: không bật thì Pipo vẫn sống bằng rule brain.

## Chạy thử

```bash
cd robo-pet
python3 -m http.server 8080        # hoặc: npx serve .
# mở http://localhost:8080/index.html
```

Mọi đường dẫn đều tương đối nên chạy được dưới bất kỳ sub-path nào (GitHub Pages `user.github.io/repo/robo-pet/`...).

### Chạy trên điện thoại

Cảm biến (motion, la bàn, camera, mic, GPS) **chỉ hoạt động trên HTTPS** (hoặc `localhost`). Cách nhanh nhất:

- Đưa thư mục `robo-pet/` lên **GitHub Pages** hoặc bất kỳ static host nào (Netlify, Cloudflare Pages, S3...), mở link HTTPS trên điện thoại.
- Hoặc chạy `npx serve .` rồi mở tunnel HTTPS (`cloudflared tunnel --url http://localhost:3000`, `ngrok http 3000`).
- Mở bằng Safari/Chrome → "Thêm vào Màn hình chính" để cài như app (chạy offline nhờ service worker; service worker chỉ đăng ký khi trang phục vụ qua http/https).

Lần đầu mở: mắt nhắm → bấm **"Đánh thức Pipo"** (cử chỉ này xin quyền motion trên iOS và mở âm thanh) → đặt tên → chọn màu mắt. Quyền camera/mic/GPS chỉ xin khi bạn bật tính năng đó.

## Tính năng

- **Mắt tham số**: mí trên nghiêng (giận/buồn), mí dưới cong (mắt cười `^ ^`), tham số riêng từng mắt, lò xo theo nhóm (mí nhanh, kích thước vừa, vị trí mềm), thở, chớp ngẫu nhiên (có chớp đôi, squash & stretch), micro-saccade, liếc khám phá, mắt phải trễ 15–40 ms, highlight parallax theo độ nghiêng máy, gradient cầu, glow nửa độ phân giải, morph hình (tim · sao · xoắn ốc · x · cung · gạch · chấm) bằng co–đổi–nở.
- **Miệng nhỏ nhu mì** (`eyes/mouth.js`): `line · smile · cat ω · o · zigzag · triangle · dot` + morph; cười, ăn (há dần khi món lại gần → cắn → nhai 3–4 Hz có vụn → liếm mép), uống (chu `o`, ực, bong bóng), ngáp, nhép theo giọng nhại và tiếng bíp (lip-sync), mếu/run khi buồn–khóc–lạnh.
- **33 biểu cảm** kèm hạt/phụ kiện: tim, sao, nước mắt, mồ hôi, Zzz, `?`, `!`, má hồng, kính râm, ô + mưa, bong bóng, vụn bánh, vết giận, hơi thở lạnh, vạch quét, nhiễu RGB.
- **Não**: nhu cầu (đói · khát · năng lượng · thương · vui) decay theo thời gian thực, sàn 0.15 khi mở lại; tâm trạng valence/arousal; phản xạ có priority/duration/cooldown và **habituation** (chọc liên tục: giật mình → nghi ngờ → bực → giận rồi quay đi; ngừng ~20 s thì quên dần).
- **Tương tác**: chạm, chọc mắt, kéo ngón tay (mắt dõi theo), nựng (vuốt qua lại ≥ 3 lượt), ôm (hai ngón giữ lâu), kéo món từ khay lên mắt để cho ăn/uống (hoặc chạm 💧 rồi nghiêng máy để rót), chạm đúp để hiện giờ bằng mắt, nhại giọng (giữ nút 🎙️), lệnh giọng nói tiếng Việt.
- **Cảm biến**: nghiêng, lắc nhẹ/mạnh, rơi tự do + chạm đất, úp mặt (ngủ, tối màn), lật ngược (mắt xoay giữ đúng chiều trọng lực), bước chân, la bàn (đồng tử chỉ Bắc, chấm vàng chỉ nhà), GPS (chỗ mới > 300 m, về nhà), thời tiết Open-Meteo, camera (mặt người, ú òa, tối, chuyển động, bắt chước nét mặt), mic (tiếng to, vỗ tay, vỗ 2 lần, im lặng), pin, đồng hồ/đêm.
- **Chế độ kiểng**: Wake Lock giữ sáng, ban đêm tự mờ, hạ còn 20 fps khi ngủ hoặc ẩn tab.
- Lưu trữ chỉ bằng `localStorage` (bọc try/catch). Không gửi dữ liệu đi đâu ngoài Open-Meteo và LLM bạn tự cấu hình.

## Ma trận hỗ trợ cảm biến

Mọi cảm biến đều tùy chọn: không hỗ trợ/bị từ chối thì tự tắt và báo trạng thái trong Cài đặt, Pipo vẫn chạy.

| Cảm biến | Android Chrome | iOS Safari | Desktop |
|---|---|---|---|
| Nghiêng · lắc · rơi · úp · lật · bước | có (HTTPS) | có, cần cấp quyền trong cử chỉ "Đánh thức" | không hỗ trợ (mắt chỉ nhìn theo chuột) |
| La bàn | có (`deviceorientationabsolute`) | có (`webkitCompassHeading`) | không |
| GPS · thời tiết | có | có | có (theo trình duyệt) |
| Camera: sáng/chuyển động/ú òa | có | có | có |
| Camera: nhận mặt (`FaceDetector`) | một số bản Chrome | không | một số bản Chrome |
| Camera: bắt chước nét mặt (MediaPipe, tải lười từ jsDelivr) | có | có (nặng) | có |
| Mic · nhại giọng | có | có | có |
| Pin (`getBattery`) | có | không | Chrome |
| Lệnh giọng nói (Web Speech `vi-VN`) | có | hạn chế | Chrome |
| Wake Lock | có | iOS 16.4+ | có |

## Cài LLM (tùy chọn)

Cài đặt ⚙️ → **LLM**: chọn `Anthropic` · `OpenAI-compatible` (OpenAI, OpenRouter, Ollama/LM Studio trong LAN — nhập `Base URL`, ví dụ `http://192.168.1.10:11434/v1`) · `Gemini`; nhập API key; Anthropic luôn chạy `claude-haiku-5-5`, ô Model chỉ áp cho OpenAI-compatible và Gemini. Key chỉ lưu `localStorage` trên máy, gọi thẳng từ trình duyệt (Anthropic dùng header `anthropic-dangerous-direct-browser-access: true`) — **đừng nhập key trên máy dùng chung**.

Khi bật sẽ hiện ô gõ chữ để trò chuyện (hoặc dùng lệnh giọng nói). LLM bắt buộc trả JSON `{expression, intensity, duration_ms, say, sound, action}`; **validator tất định** (`brain/llm.js`) chặn JSON hỏng, id lạ, số ngoài khoảng (clamp/bỏ), rồi fallback về rule brain. Timeout 8 s, mất mạng thì im lặng. LLM không bao giờ sửa nhu cầu. Tùy chọn "độc thoại" tối đa 1 lần/10 phút.

## URL đặc biệt

- `index.html?debug=1` — bảng debug: chọn mọi biểu cảm, kéo slider nhu cầu, nhép miệng thủ công, nút giả lập sự kiện (lắc, rơi, mưa, mặt người, ú òa, vỗ tay, cho ăn...) để thử trên desktop.
- `index.html?gallery=1` — tự lướt qua mọi biểu cảm, mỗi cái 1,5 giây.

## Kiểm thử

```bash
node --test test/*.test.js        # logic thuần: spring, preset mắt+miệng, animator, needs, habituation, rule brain, validator LLM, cảm biến
npm test                          # tương đương
```

(Node 22 không nhận `node --test test/` dạng thư mục; dùng glob như trên.)

Smoke test trình duyệt (Playwright, **không** nằm trong repo, cài ở thư mục ngoài):

```bash
mkdir -p /tmp/pw && cd /tmp/pw && npm i playwright-core
cd /đường/dẫn/robo-pet
NODE_PATH=/tmp/pw/node_modules node test/browser-smoke.mjs [baseUrl] [thưMụcẢnh]
```

Script tự dựng server tĩnh nếu không truyền `baseUrl`, dùng Chromium có sẵn (`PLAYWRIGHT_BROWSERS_PATH`, mặc định `/opt/pw-browsers`), chạy `?gallery=1`, `?debug=1`, onboarding, drawer, kéo món ăn, nựng, chạm đúp; kiểm không có lỗi console/page và chụp ảnh từng biểu cảm.

## Cấu trúc

```
index.html · manifest.webmanifest · sw.js
src/main.js                 vòng lặp rAF, nối module
src/core/                   spring · bus · store
src/eyes/                   params · mouth · expressions · animator · renderer · fx
src/brain/                  needs · mood · reactions · rules · gestures · llm
src/sensors/                motion · compass · geo · weather · camera · mic · battery · clock
src/audio/                  chirp · mimic · voice · sounds
src/ui/                     drawer · feed · settings · onboarding · debug · dom
test/                       *.test.js (node --test) · browser-smoke.mjs
```

## Giới hạn đã biết

- Cảm biến thật (motion, camera, mic, GPS, la bàn, Web Speech, MediaPipe) chỉ kiểm bằng logic thuần + giả lập sự kiện; chưa thử trên thiết bị thật trong môi trường tự động.
- Nhại giọng dùng `ScriptProcessorNode` (đã deprecated nhưng chạy rộng rãi) thay vì AudioWorklet để giữ không cần file phụ.
- Bắt chước nét mặt tải MediaPipe từ jsDelivr nên cần mạng lần đầu; tải lỗi thì tự tắt tính năng.
- Chromium headless báo "charging" nên có thể thấy Pipo "uống điện" ngay khi mở trong môi trường test.

## Chạy thử trên artifact claude.ai

`python robo-pet/tools/build_artifact.py <thư-mục-ra>` dựng `pipo.html` (chỉ giữ `<title>`, `<style>`, body) và in ra map `files` cho các module `src/`. Publish trang đó với `root` = `robo-pet/` và capability `sample`.

Trong artifact:
- Chạy được: chọc, nựng, cho ăn, uống, toàn bộ biểu cảm, tiếng bíp (sau lần chạm đầu), chạm đúp xem giờ. Thêm `#debug` hoặc `#gallery` vào cuối link (artifact không truyền query string).
- Não LLM: provider `claude-artifact` được bật tự động, dùng Claude Haiku có sẵn của artifact (không cần API key; lần chat đầu claude.ai hỏi quyền).
- Không chạy: camera, mic, GPS, cảm biến chuyển động, thời tiết, gọi API LLM ngoài. Khung artifact chặn những thứ này; muốn dùng thì mở bản PWA qua HTTPS.

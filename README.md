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
- **Cài như app (không thanh trình duyệt):** Android Chrome → nút nhỏ "📲 Cài như app" góc trái hoặc ⚙️ Cài đặt → **Ứng dụng** → "Cài Pipo như ứng dụng" (hoặc menu ⋮ → "Cài đặt ứng dụng"). iPhone/iPad → Safari (hoặc Chrome) → nút Chia sẻ → "Thêm vào Màn hình chính". Mở Pipo từ icon mới: app chạy toàn màn hình (`display: fullscreen`, máy không hỗ trợ thì `standalone`) và chạy offline nhờ service worker (chỉ đăng ký khi trang phục vụ qua http/https).
- Còn chạy trong tab: Cài đặt → Ứng dụng có nút "⛶ Toàn màn hình" và tùy chọn tự toàn màn hình ở mỗi lần chạm (iPhone Safari không hỗ trợ Fullscreen API — phải cài ra màn hình chính).
- Lưu ý iOS: app ngoài màn hình chính có bộ nhớ riêng, tách khỏi Safari, nên Pipo trong app là một con mới.
- Icon (PNG 192 · 512 · maskable 512 · apple-touch-icon 180) được vẽ bằng `python3 tools/make_icons.py` và nhúng dạng data URI vào `manifest.webmanifest` + `index.html` — repo không track file ảnh. Đổi hình icon thì sửa script rồi chạy lại.

Lần đầu mở: mắt nhắm → bấm **"Đánh thức Pipo"** (cử chỉ này xin quyền motion trên iOS và mở âm thanh) → đặt tên → chọn màu mắt. Quyền camera/mic/GPS chỉ xin khi bạn bật tính năng đó.

## Tính năng

- **Mắt tham số**: mí trên nghiêng (giận/buồn), mí dưới cong (mắt cười `^ ^`), tham số riêng từng mắt, lò xo theo nhóm (mí nhanh, kích thước vừa, vị trí mềm), thở, chớp ngẫu nhiên (có chớp đôi, squash & stretch), micro-saccade, liếc khám phá, mắt phải trễ 15–40 ms, highlight parallax theo độ nghiêng máy, gradient cầu, glow nửa độ phân giải, morph hình (tim · sao · xoắn ốc · x · cung · gạch · chấm) bằng co–đổi–nở.
- **Miệng nhỏ nhu mì** (`eyes/mouth.js`): `line · smile · cat ω · o · zigzag · triangle · dot` + morph; cười, ăn (há dần khi món lại gần → cắn → nhai 3–4 Hz có vụn → liếm mép), uống (chu `o`, ực, bong bóng), ngáp, nhép theo giọng nhại và tiếng bíp (lip-sync), mếu/run khi buồn–khóc–lạnh.
- **35 biểu cảm** kèm hạt/phụ kiện: tim, sao, nước mắt, mồ hôi, Zzz, `?`, `!`, má hồng, kính râm, ô + mưa, bong bóng, vụn bánh, vết giận, hơi thở lạnh, vạch quét, nhiễu RGB, nốt nhạc ♪ ♫ (biểu cảm `groove`), sao bay vòng quanh đầu khi giả chết (biểu cảm `ko`).
- **Giao diện (skin)** — cách vẽ thân Pipo, đổi trong Cài đặt ▸ *Giao diện* (độc lập với màu mắt và kiểu mắt, áp được cho mọi skin):
  - `classic`: hai mắt + miệng trên nền tối (bản gốc).
  - `pixel`: ma trận LED — mặt dựng vào lưới ô vuông độ phân giải thấp rồi vẽ thành chấm LED bo tròn, ô tắt vẫn hiện mờ như lưới "ma", có quầng sáng.
  - `eve`: robot mini trắng bóng có thân và tay (dáng gợi nhớ EVE nhưng là thiết kế riêng): đầu trứng nằm ngang, mặt kính đen chứa đôi mắt, thân trứng thuôn dưới, hai tay hình lá lơ lửng bên thân, bay lơ lửng trên bóng elip. Tay đổi theo biểu cảm (vui giơ lên ngọ nguậy, buồn rủ xuống, sợ/ngượng che mặt, giận hạ xuống siết, ăn/uống chụm trước miệng, được thương dang rộng, ngủ khép sát, tò mò gãi đầu).
  Mọi skin đều nhún/lắc/nghiêng/ép dẹt theo "tư thế" (`eyes/body.js`).
- **Nghe nhạc & nhảy theo** (cần micro, mặc định tắt): bật bằng nút 🎵 trong drawer hoặc Cài đặt ▸ Cảm biến. Pipo nghe nhạc ngoài môi trường, nhận ra nhịp (BPM, pha) rồi chú ý ("?", liếc quanh) → nhảy theo nhịp (gật · lắc · bước · nghiêng đầu · hype, đổi mỗi 8 nhịp, biên độ theo năng lượng bài) → thỏa mãn khi nhạc tắt. Nhép miệng hát, nốt nhạc bay ra theo nhịp; nhạc kéo dài làm tăng "vui". Trong lúc có nhạc, vỗ tay/tiếng to không làm Pipo giật mình; chọc/nựng/cho ăn vẫn ưu tiên hơn nhảy rồi quay lại nhảy. Đang ngủ thì không nhảy; nhu cầu năng lượng thấp thì chỉ gật gù lim dim.
- **Động tác tay**: 11 động tác — chào (vẫy 3 nhịp) · tạm biệt (hai tay) · nghiêm/tuân lệnh (bàn tay khép lên trán, giữ ~1,2 s) · đấm (rút về rồi đấm vào người xem: nắm đấm phóng to, rung màn, tia "pow") · combo trái-phải-trái · đập tay (giơ lòng bàn tay chờ 2,5 s: chạm vào tay thì "bép", không chạm thì nhún vai buồn nhẹ) · cụng tay · ngón cái (lấp lánh) · vỗ tay (đang nhảy hype thì vỗ đúng nhịp) · chỉ vào người xem · ú òa che mắt. Gọi bằng nút **✋ Động tác** trong drawer (chạm là Pipo làm), lệnh giọng nói, hoặc LLM (`action`). Pipo cũng tự vẫy khi thấy mặt người sau ≥ 10 phút vắng, chào buổi sáng ở lần mở đầu tiên của ngày (5h–11h), và thỉnh thoảng vỗ tay/giơ nắm đấm khi nhảy hype. Classic: đôi găng tay hoạt hình vẽ bằng path (viền sáng màu theme); pixel: cùng găng thành tay chấm LED; eve: chính đôi tay có sẵn thực hiện động tác (đầu tay đổi dạng: nắm đấm có vạch ngón, ngón cái, ngón trỏ).
- **Bắn súng tay → giả chết** (không máu, chỉ là hoạt hình): chĩa tay dạng súng (ngón trỏ duỗi + ngón cái dựng) vào camera ≥ 0,4 s → Pipo hoảng, mắt mở to, giơ hai tay đầu hàng, run nhẹ. "Bắn" = ngón cái gập xuống, đầu ngón trỏ giật lên, hoặc tiếng động đột ngột (vỗ tay, "pằng", "bùm", "pew") trong lúc đang chĩa → Pipo giật lùi, mắt thành `x`, miệng `o`, sao bay vòng đầu, đổ ra sàn nằm co giật nhẹ ~3 s (classic/pixel: cả mặt xoay nằm ngang; Eve ngã xuống sàn, tay rũ). **Hồi sinh:** chạm/nựng → bật dậy chóng mặt rồi vui; không ai chạm sau 8 s → tự dậy, nháy mắt, "Hì, giả vờ đó!". **Quen dần:** bắn liên tục, lần 3 trong 30 s Pipo né ("Hụt rồi!"), lần 4 bắn trả bằng tay hình súng ("Pew!") rồi tính lại từ đầu. Không có camera vẫn chơi được: nói "pằng/bùm/pew" hoặc dùng nút debug. **Bắt chước tay người:** người vẫy → Pipo vẫy; đưa nắm đấm tới → cụng tay; giơ ngón cái → ngón cái; giữ lòng bàn tay mở → đập tay (đang giơ tay chờ thì giữ tay là đập trúng). Cần bật Cài đặt ▸ Cảm biến ▸ **Nhận dáng tay (tải MediaPipe)** (cần camera đang bật; tải `HandLandmarker` lười từ jsDelivr + Google Storage, ~12 khung/giây, tối đa 2 tay; tải lỗi thì tự tắt và báo trạng thái).
- **Gặp bạn Pipo** (📡 trong drawer): hai Pipo ở gần nhau nói chuyện bằng **tiếng bíp thật** (điều chế 16 tông trong dải nghe được, ~2–6 s mỗi gói, có CRC và gửi hai bản xáo trộn nên chịu được tiếng ồn phòng và tiếng nói chen ngang). Bật chế độ 90 s trên cả hai máy (cần micro + loa + bật âm thanh): Pipo "bíp bíp?" tìm bạn → gặp được thì mừng, vẫy tay, hiện tên bạn trong bóng nói → 2–4 lượt trao đổi cảm xúc (mỗi bên phản ứng với cảm xúc của bên kia) → nếu đang có nhạc thì nhảy cùng → tạm biệt. Danh sách bạn đã gặp (tên, số lần, tối đa 50) lưu local; không gửi gì qua mạng. Xem *Giới hạn đã biết* về những gì chưa thử giữa hai máy thật.
- **Não**: nhu cầu (đói · khát · năng lượng · thương · vui) decay theo thời gian thực, sàn 0.15 khi mở lại; tâm trạng valence/arousal; phản xạ có priority/duration/cooldown và **habituation** (chọc liên tục: giật mình → nghi ngờ → bực → giận rồi quay đi; ngừng ~20 s thì quên dần).
- **Tương tác**: chạm, chọc mắt, kéo ngón tay (mắt dõi theo), nựng (vuốt qua lại ≥ 3 lượt), ôm (hai ngón giữ lâu), kéo món từ khay lên mắt để cho ăn/uống (hoặc chạm 💧 rồi nghiêng máy để rót), chạm đúp để hiện giờ bằng mắt, nhại giọng (giữ nút 🎙️), lệnh giọng nói tiếng Việt.
- **Cảm biến**: nghiêng, lắc nhẹ/mạnh, rơi tự do + chạm đất, úp mặt (ngủ, tối màn), lật ngược (mắt xoay giữ đúng chiều trọng lực), bước chân, la bàn (đồng tử chỉ Bắc, chấm vàng chỉ nhà), GPS (chỗ mới > 300 m, về nhà), thời tiết Open-Meteo, camera (mặt người, ú òa, tối, chuyển động, bắt chước nét mặt), mic (tiếng to, vỗ tay, vỗ 2 lần, im lặng), pin, đồng hồ/đêm.
- **Chế độ kiểng**: Wake Lock giữ sáng, ban đêm tự mờ, hạ còn 20 fps khi ngủ hoặc ẩn tab.
- Lưu trữ chỉ bằng `localStorage` (bọc try/catch). Dữ liệu chỉ rời máy tới: Open-Meteo (thời tiết, khi bạn bật), nhà cung cấp LLM bạn tự cấu hình, và — chỉ ở bản build có cấu hình máy chủ — [thống kê ẩn danh](#thống-kê-ẩn-danh) (tắt được trong Cài đặt).

## Lệnh giọng nói

Bật *Giọng nói* trong Cài đặt ▸ Cảm biến (Web Speech `vi-VN`, so khớp không dấu). Lệnh cũ: *ngủ đi · dậy đi · ăn không · nhìn anh đây · nhảy đi · giận à*. Lệnh động tác tay (chỉ nhận khi câu ngắn, để "tôi không rõ" hay "hi vọng" không kích nhầm): **chào / xin chào / hello / hi** → vẫy · **tạm biệt / bye / bai bai** → hai tay vẫy · **nghiêm / tuân lệnh / chào cờ / rõ** → chào kiểu quân đội · **đấm / đánh / đấm đi** → đấm · **đấm liền** → combo · **đập tay / high five** → đập tay · **cụng tay** → cụng nắm đấm · **like / tuyệt / giỏi** → ngón cái (Pipo vui, thương tăng) · **vỗ tay** → vỗ tay · **ú òa** → che mắt rồi ú òa · **pằng / bùm / bang / pew** → trúng đạn, giả chết (câu ≤ 2 từ).

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

## Thống kê ẩn danh

Để biết có người quay lại không (D1/D7/D30), dùng nhiều hay ít, tính năng nào được dùng, Pipo có thể gửi **tối đa hai gói nhỏ mỗi ngày** — không có định danh nào: gói `active` (có mở app, gửi ngay lần mở đầu ngày) và gói `day` (số đếm của ngày hôm trước).

- **Gói `active`** (ngay lần mở đầu tiên mỗi ngày): chỉ `v · kind · day · dsi · a7 · a30 · mode · platform · lang` — để đếm người dùng hoạt động, cài mới và D1/D7/D30; không có bộ đếm, skin hay cảm biến.
- **Gói `day`** (ngày hôm trước, thu thêm): số ngày kể từ lúc cài (0–30, quá thì 31) · số ngày đã mở trong 7 và 30 ngày gần nhất · số lần mở và số phút dùng (làm tròn theo khoảng) · số lần dùng từng tính năng (chọc, nựng, ôm, cho ăn, uống, nhại giọng, chat LLM, nghe nhạc, nhảy, xem giờ, mở cài đặt, hộp cài app) làm tròn theo khoảng 0 · 1 · 2–5 · 6–20 · 21+ · chạy trong trình duyệt hay đã cài (`browser`/`standalone`) · `android`/`ios`/`desktop`/`other` · ngôn ngữ 2 chữ · tên giao diện và màu mắt · danh sách cảm biến đang bật · tên nhà cung cấp LLM hoặc `none`.
- **Không thu:** ID cài đặt/thiết bị, cookie, IP (máy chủ mẫu không đọc và không lưu), vị trí, nội dung trò chuyện, tên Pipo, khóa API/Base URL/model, âm thanh, hình ảnh. Ngày cài chỉ nằm trong máy bạn; lên máy chủ chỉ có "số ngày kể từ cài".
- **Cách gửi:** gom trong `localStorage` (khóa `pipo.telemetry`, theo ngày UTC). Gói `active` đi ngay lần mở đầu ngày (tối đa 1 lần/ngày). Gói `day` đi khi mở app sang ngày mới (hoặc ẩn tab/đóng trang sau khi đã sang ngày), **tối đa một gói của ngày hôm trước**; cả hai gửi bằng `navigator.sendBeacon` (dự phòng `fetch` keepalive, không cookie), không thử lại. Gói `day` cũ hơn 2 ngày bị bỏ, không gửi. DAU và retention đọc từ gói `active` (không thiên lệch); mức dùng tính năng đọc từ gói `day`, vốn chỉ là mẫu những người quay lại trong 2 ngày.
- **Không gửi gì** khi: `TELEMETRY_ENDPOINT` trong `src/config.js` để rỗng (mặc định — tắt hoàn toàn, không gom gì); trình duyệt bật Do Not Track hoặc Global Privacy Control; `?debug=1` / `#gallery`; chạy trong artifact claude.ai; chạy ở `localhost`/`127.0.0.1`; hoặc bạn đã tắt.
- **Tắt ở đâu:** Cài đặt ▸ *Thống kê ẩn danh* — bỏ chọn "Gửi thống kê ẩn danh". Tắt thì xóa luôn bộ đếm chưa gửi. Nút **Xem gói sẽ gửi** hiện đúng JSON của gói `active` hôm nay và gói `day` của hôm nay (sẽ gửi sau khi sang ngày); dòng trạng thái bên trên nói rõ đang gửi hay vì sao không gửi.
- **Tự triển khai máy chủ nhận:** [`tools/telemetry-worker/`](tools/telemetry-worker/README.md) (Cloudflare Worker + Analytics Engine, kèm truy vấn DAU, cài mới, D1/D7/D30 từ gói `active`, tỉ lệ dùng tính năng từ gói `day`). Triển khai xong thì đặt URL vào `TELEMETRY_ENDPOINT`. Bản fork không đặt URL thì không gửi gì.

## Cài LLM (tùy chọn)

Cài đặt ⚙️ → **LLM**: chọn `Anthropic` · `OpenAI-compatible` (OpenAI, OpenRouter, Ollama/LM Studio trong LAN — nhập `Base URL`, ví dụ `http://192.168.1.10:11434/v1`) · `Gemini`; nhập API key; Anthropic luôn chạy `claude-haiku-5-5`, ô Model chỉ áp cho OpenAI-compatible và Gemini. Key chỉ lưu `localStorage` trên máy, gọi thẳng từ trình duyệt (Anthropic dùng header `anthropic-dangerous-direct-browser-access: true`) — **đừng nhập key trên máy dùng chung**.

Khi bật sẽ hiện ô gõ chữ để trò chuyện (hoặc dùng lệnh giọng nói). LLM bắt buộc trả JSON `{expression, intensity, duration_ms, say, sound, action}`; **validator tất định** (`brain/llm.js`) chặn JSON hỏng, id lạ, số ngoài khoảng (clamp/bỏ), rồi fallback về rule brain. Timeout 8 s, mất mạng thì im lặng. LLM không bao giờ sửa nhu cầu. Tùy chọn "độc thoại" tối đa 1 lần/10 phút.

## URL đặc biệt

- `index.html?debug=1` — bảng debug: chọn mọi biểu cảm, kéo slider nhu cầu, nhép miệng thủ công, nút giả lập sự kiện (lắc, rơi, mưa, mặt người, ú òa, vỗ tay, cho ăn...) để thử trên desktop.
- Bảng debug còn có các nút **Giả lập chĩa súng** · **Giả lập bắn** · **Hạ súng** · **Pằng!** và **Người vẫy tay / đưa nắm đấm / giơ ngón cái / giơ tay mở** (phát thẳng sự kiện `hand:*`, bỏ qua camera). Đường nhận dáng thật được test bằng landmark tổng hợp (`test/handfixtures.js`): `window.__pipo.handSensor.feed(hands, aspect, t)`.
- Nút debug **Giả lập bạn Pipo**: một bạn Pipo ảo ("Bibi") bật cùng bạn, hai bên nói chuyện qua PCM tiếng bíp thật (mã hóa → bộ giải mã) chạy nhanh gấp 4, không cần micro: tìm bạn → gặp → trao đổi → tạm biệt (~15 s).
- Trong bảng debug còn có ô chọn **Động tác** + nút *Làm* / *Dừng* để thử mọi clip (kể cả `handsup` · `gun` · `fistpump` chưa gắn vào phản xạ) mà không cần giọng nói; `window.__pipo.playGesture('wave')` làm tương tự từ console.
- `index.html?gallery=1` — tự lướt qua mọi biểu cảm, mỗi cái 1,5 giây.
- `?skin=classic|pixel|eve` — mở thẳng một giao diện (lưu luôn làm lựa chọn). Kết hợp được: `?debug=1&skin=eve`, `?gallery=1&skin=pixel`. Ở nơi không truyền query (artifact) dùng hash: `#gallery&skin=eve`, `#debug&skin=pixel` (vẫn nhận `#debug` / `#gallery` trần).
- Trong bảng debug: ô chọn *Giao diện* và nút **Giả lập nhạc 120 BPM** (thay nguồn nhịp bằng bộ phát tổng hợp, thử nhảy trên desktop không cần micro).

## Kiểm thử

```bash
node --test test/*.test.js        # logic thuần: spring, preset mắt+miệng, animator, needs, habituation, rule brain, validator LLM, cảm biến, nhịp (beat), dance director, pose (body), skin, thống kê ẩn danh + validate/worker
npm test                          # tương đương
```

(Node 22 không nhận `node --test test/` dạng thư mục; dùng glob như trên.)

Smoke test trình duyệt (Playwright, **không** nằm trong repo, cài ở thư mục ngoài):

```bash
mkdir -p /tmp/pw && cd /tmp/pw && npm i playwright-core
cd /đường/dẫn/robo-pet
SHOTS=/thư/mục/ảnh NODE_PATH=/tmp/pw/node_modules node test/browser-smoke.mjs [baseUrl] [thưMụcẢnh]
```

Script tự dựng server tĩnh nếu không truyền `baseUrl`, dùng Chromium có sẵn (`PLAYWRIGHT_BROWSERS_PATH`, mặc định `/opt/pw-browsers`), chạy `?gallery=1`, `?debug=1`, onboarding, drawer, kéo món ăn, nựng, chạm đúp, rồi từng skin (classic · pixel · eve) ở gallery dọc + ngang và đang nhảy với nhạc giả (kiểm chọc thắng nhảy, nhảy lại sau phản xạ, outro khi nhạc tắt); rồi thống kê ẩn danh (endpoint giả + đồng hồ giả nhảy ngày: 1 gói `active` + 1 gói `day` mỗi ngày, chỉ có khóa cho phép, tắt thì xóa bộ đếm, GPC thì không gửi); kiểm không có lỗi console/page và chụp ảnh từng biểu cảm + từng skin. Thư mục ảnh mặc định: `$SHOTS` hoặc `<tmp>/pipo-shots`.

## Cấu trúc

```
index.html · manifest.webmanifest · sw.js
src/main.js                 vòng lặp rAF, nối module
src/config.js               hằng build (TELEMETRY_ENDPOINT)
src/core/                   spring · bus · store · telemetry
src/eyes/                   params · mouth · expressions · animator · renderer · fx · body (pose) · handclips (clip tay) · hands (găng tay classic/pixel) · fall (gục ngã)
src/skins/                  index (registry) · classic · pixel · eve
src/brain/                  needs · mood · reactions · rules · gestures · llm · dance · handpose (phân loại dáng tay) · meet (giao thức gặp bạn)
src/sensors/                motion · compass · geo · weather · camera · hands (MediaPipe) · mic · music · battery · clock
src/audio/                  chirp · mimic · voice (lệnh giọng) · sounds · beat · modem (modem tiếng bíp) · meetlink · meetsession · meetio (gặp bạn)
src/ui/                     drawer · feed · settings · onboarding · debug · dom · install (cài app · toàn màn hình)
tools/                      make_icons.py (icon PNG nhúng) · build_artifact.py · telemetry-worker/ (Cloudflare Worker nhận thống kê)
test/                       *.test.js (node --test) · browser-smoke.mjs
```

## Thêm skin mới

Skin = một object `export default` trong `src/skins/<id>.js`, thêm MỘT dòng import + một phần tử vào `SKINS` ở `src/skins/index.js` (và đường dẫn file vào `ASSETS` của `sw.js`). Contract (JSDoc ở đầu `src/skins/index.js`):

```js
{ id, label,
  geom(base, frame, pose) -> geom        // tùy chọn: chỉnh tâm/khổ mặt; giữ cấu trúc {U,B,D,cx,cy,L,R,mouth,color,W,H}
                                         // vì main.js dùng geom để chạm / cho ăn / hạt hiệu ứng
  draw(r, ctx, frame, fx, extras, g, pose) // vẽ TOÀN cảnh kể cả nền (r = Renderer)
  resize?(r) }                           // tùy chọn: dựng lại cache (gradient, canvas offscreen); trạng thái riêng để ở r.sk[id]
```

`Renderer` cho sẵn các mảnh để ghép: `r.paintBg(ctx)` (nền + vignette), `r.applyPose(ctx, g, pose)` (nhún/lắc/nghiêng/ép quanh tâm mặt), `r.drawFace(ctx, frame, fx, g, {glow, clip})` (glow + hạt + mắt + miệng + nhiễu; `clip(ctx)` dựng path để cắt mặt vào một vùng như kính của Eve), `r.drawOverlay(ctx, extras, g)` (chữ `say` + màn tối). `pose` = `{bob, sway, tilt, squash, hover, armL:{lift,spread,curl}, armR}` từ `eyes/body.js`; skin không có tay chỉ cần bỏ qua `arm*`. Test contract nằm ở `test/skins.test.js`.

## Nghe nhạc: cách hoạt động và giới hạn

Chuỗi xử lý (chi tiết ở `DESIGN.md` §9): micro → phổ FFT 2048 mỗi 20 ms → onset → tempo → pha → nhận diện nhạc → dance director → pose.

- Cần **quyền micro** (HTTPS hoặc localhost) và tắt xử lý âm thanh của trình duyệt (`echoCancellation/noiseSuppression/autoGainControl: false`) để giữ nguyên nhịp.
- Nhạc phát **từ chính điện thoại** vẫn được micro thu nhưng thường yếu và méo; nhạc ngoài loa rời, ở khoảng cách vừa phải cho kết quả tốt hơn. Tiếng nói, tiếng ồn, vỗ tay lẻ không bị nhận là nhạc; nhạc cần nhịp khá đều (ưu tiên 70–180 BPM, ngoài khoảng sẽ bị gập nửa/đôi; trên 140 BPM Pipo nhảy nửa tốc).
- Cần ~3 s nhạc để Pipo nhận ra, và ~2–3 s im/lộn xộn để coi là nhạc đã tắt.
- Chỉ kiểm bằng nhịp tổng hợp (click track, nhiễu, giọng nói giả) và nguồn giả ở debug; chưa thử với nhạc thật trên thiết bị thật.

## Giới hạn đã biết

- Cảm biến thật (motion, camera, mic, GPS, la bàn, Web Speech, MediaPipe) chỉ kiểm bằng logic thuần + giả lập sự kiện; chưa thử trên thiết bị thật trong môi trường tự động.
- Nhại giọng dùng `ScriptProcessorNode` (đã deprecated nhưng chạy rộng rãi) thay vì AudioWorklet để giữ không cần file phụ.
- **Gặp bạn** chỉ kiểm bằng PCM tổng hợp (nhiễu trắng, suy giảm, lệch tốc độ mẫu, tiếng nói giả, đầu-cuối hai máy trạng thái) và bằng nút debug; **chưa thử giữa hai thiết bị thật**: chưa biết loa/micro điện thoại có đáp ứng đủ 1,8–4,2 kHz không, mức ồn phòng thật, vang phòng (echo kéo dài làm nhòe ký hiệu 60 ms), khoảng cách tối đa, và độ trễ/khung của ScriptProcessor trên Android/iOS. iOS Safari cần cấp quyền micro trong cử chỉ chạm. Tiếng bíp nghe được nên người xung quanh cũng nghe; tiếng nói chen lớn hơn gói ~3 dB thì mất gói (Pipo gửi lại, tối đa 2 lần).
- Bắt chước nét mặt tải MediaPipe từ jsDelivr nên cần mạng lần đầu; tải lỗi thì tự tắt tính năng.
- Chromium headless báo "charging" nên có thể thấy Pipo "uống điện" ngay khi mở trong môi trường test.

## Chạy thử trên artifact claude.ai

`python robo-pet/tools/build_artifact.py <thư-mục-ra>` dựng `pipo.html` (chỉ giữ `<title>`, `<style>`, body) và in ra map `files` cho các module `src/`. Publish trang đó với `root` = `robo-pet/` và capability `sample`.

Trong artifact:
- Chạy được: chọc, nựng, cho ăn, uống, toàn bộ biểu cảm, tiếng bíp (sau lần chạm đầu), chạm đúp xem giờ. Thêm `#debug` hoặc `#gallery` vào cuối link (artifact không truyền query string).
- Não LLM: provider `claude-artifact` được bật tự động, dùng Claude Haiku có sẵn của artifact (không cần API key; lần chat đầu claude.ai hỏi quyền).
- Không chạy: camera, mic, GPS, cảm biến chuyển động, thời tiết, gọi API LLM ngoài. Khung artifact chặn những thứ này; muốn dùng thì mở bản PWA qua HTTPS.

## Bản public (GitHub Pages)

Bản chạy thử đủ cảm biến nằm ở repo public [`ntnam2809/pipo`](https://github.com/ntnam2809/pipo) (Pages: https://ntnam2809.github.io/pipo/). Nguồn phát triển vẫn là `robo-pet/` ở repo này; phát hành bằng cách chép nguyên thư mục sang repo `pipo` rồi push `main`.

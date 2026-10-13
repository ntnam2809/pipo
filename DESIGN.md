# Pipo — Robot Pet Eyes (bản thiết kế)

> Ứng dụng **độc lập, ngoài NeutrinoVerse**: không áp luật lore, không tra canon.
> Mục tiêu: biến smartphone thành một con pet robot chỉ có **đôi mắt**, cực dễ thương,
> nhiều biểu cảm, animation mắt có chiều sâu, phản ứng với các cảm biến sẵn có trên điện thoại.
> LLM là **tùy chọn**: có thì pet thông minh hơn, không có thì pet vẫn sống đủ để đặt làm vật trang trí.

## 1. Nguyên tắc sản phẩm

1. **Mắt là chính, miệng nhỏ là phụ.** Không vẽ mặt, chỉ có hai mắt và **một cái miệng nhỏ** bên dưới. Mắt gánh phần lớn cảm xúc; miệng nhỏ, nhu mì, dùng để cười, ăn, uống và làm mềm biểu cảm. Phần còn lại diễn tả bằng ánh sáng, chuyển động và các hạt nhỏ (tim, sao, giọt nước, Zzz).
2. **Không bao giờ đứng im.** Kể cả khi idle, mắt và miệng vẫn thở, chớp, liếc nhẹ (micro-saccade) và nhìn theo chuyển động. Đây là thứ làm pet "sống".
3. **Chuyển động có vật lý.** Mọi tham số mắt đi qua lò xo (spring), không tween tuyến tính. Có squash & stretch, overshoot nhẹ và trễ giữa hai mắt (lệch khoảng 15–40 ms) để không thấy máy móc.
4. **Mọi cảm biến đều tùy chọn.** Thiếu quyền hay máy không hỗ trợ thì tắt cảm biến đó đi, pet vẫn chạy bình thường.
5. **Chạy offline, không cần build.** Dùng PWA thuần (HTML + ES module + Canvas 2D + WebAudio), mở bằng trình duyệt điện thoại là chạy, cài lên màn hình chính được. Không framework, không bundler, không asset ảnh hay âm thanh: tất cả vẽ và tổng hợp bằng code.
6. **Hiền và không phạt.** Nhu cầu giảm theo thời gian, nhưng pet không chết, không bệnh, không bỏ đi. Đói thì làm mặt tội nghiệp; cho ăn là vui lại ngay.

## 2. Kiến trúc

```
robo-pet/
├─ index.html               # 1 canvas full màn hình + UI overlay
├─ manifest.webmanifest     # PWA, display: fullscreen, nền đen
├─ sw.js                    # network-first, mất mạng dùng cache (chạy offline)
├─ src/
│  ├─ main.js               # vòng lặp rAF, nối các module
│  ├─ core/spring.js        # lò xo tới hạn/thiếu tắt, vector spring
│  ├─ core/bus.js           # event bus (sensor → brain → eyes/audio)
│  ├─ core/store.js         # persist localStorage (try/catch), version + migrate
│  ├─ eyes/params.js        # schema tham số một con mắt + clamp
│  ├─ eyes/expressions.js   # bảng preset biểu cảm (dữ liệu thuần)
│  ├─ eyes/animator.js      # blend preset + lớp sống (blink, saccade, breath, look-at)
│  ├─ eyes/renderer.js      # vẽ Canvas: hình mắt, mí, đồng tử, highlight, glow, parallax
│  ├─ eyes/fx.js            # hạt & phụ kiện: tim, sao, nước mắt, mồ hôi, Zzz, ?, !, xoắn ốc, má hồng, kính râm, ô, nốt nhạc
│  ├─ eyes/body.js          # pose thân/đầu/tay (lò xo) từ biểu cảm + điệu nhảy
│  ├─ skins/                # skin (giao diện): index (registry) · classic · pixel · eve
│  ├─ brain/needs.js        # đói · khát · năng lượng · thương · vui (0..1), decay theo thời gian thực
│  ├─ brain/mood.js         # valence/arousal liên tục + chọn biểu cảm nền
│  ├─ brain/reactions.js    # phản xạ theo sự kiện: priority, duration, cooldown, habituation
│  ├─ brain/rules.js        # "não" không LLM: luật chọn phản ứng + lời thoại ngắn
│  ├─ brain/llm.js          # khe LLM tùy chọn: provider adapter + validator JSON
│  ├─ brain/dance.js        # dance director: chú ý → nhảy → thỏa mãn, bộ động tác
│  ├─ sensors/motion.js     # DeviceOrientation/Motion: nghiêng, lắc, rơi, úp, lật, bước chân
│  ├─ sensors/compass.js    # hướng Bắc (webkitCompassHeading / alpha absolute)
│  ├─ sensors/geo.js        # GPS: nhà, quãng đường, chỗ mới
│  ├─ sensors/weather.js    # Open-Meteo (không key), cache 30 phút
│  ├─ sensors/camera.js     # camera trước: độ sáng, chuyển động, khuôn mặt (FaceDetector nếu có)
│  ├─ sensors/mic.js        # âm lượng, vỗ tay, im lặng
│  ├─ sensors/music.js      # nghe nhạc ngoài môi trường: phổ → BeatTracker
│  ├─ sensors/battery.js    # pin yếu / đang sạc
│  ├─ sensors/clock.js      # giờ trong ngày, lịch ngủ
│  ├─ audio/chirp.js        # tiếng robot tổng hợp (bíp bụp kiểu R2) theo cảm xúc
│  ├─ audio/mimic.js        # nhại giọng: thu → pitch-shift + robot hóa → phát lại, mắt nhép theo
│  ├─ audio/voice.js        # Web Speech: nhận lệnh (tùy chọn) + TTS giọng robot (tùy chọn)
│  ├─ audio/beat.js         # BeatTracker: onset → tempo → pha (PLL) → nhận diện nhạc
│  └─ ui/{drawer,feed,settings,onboarding,debug}.js
├─ test/*.test.js           # node --test cho logic thuần
└─ README.md
```

Luồng chạy: `sensors/* → bus (event có tên + payload) → brain (needs, mood, reactions, rules/llm) → animator (mục tiêu tham số) → spring → renderer`. Brain không gọi renderer trực tiếp mà chỉ đặt **intent** `{expression, intensity, duration, lookAt?, fx?, sound?, say?}`.

Logic thuần (spring, expressions, animator, needs, mood, reactions, rules, validator của llm) **không** đụng DOM, để test được bằng `node --test`.

## 3. Mắt — phần phải vượt trội

### 3.1 Tham số một con mắt (`eyes/params.js`)

| Tham số | Ý nghĩa | Khoảng |
|---|---|---|
| `w`, `h` | kích thước khối mắt (tỉ lệ theo đơn vị màn) | 0.05–1.6 |
| `radius` | bo góc khối mắt (0 = vuông, 1 = tròn/oval) | 0–1 |
| `x`, `y` | lệch vị trí so với chỗ gốc | −1..1 |
| `tilt` | xoay khối mắt (rad), dùng cho giận/buồn | −0.6..0.6 |
| `lidTop` | mí trên phủ xuống (0 mở, 1 nhắm) | 0–1 |
| `lidTopAngle` | độ nghiêng mí trên: âm = giận (vào trong), dương = buồn | −1..1 |
| `lidBottom` | mí dưới đẩy lên, kiểu mắt cười `^ ^` | 0–1 |
| `lidBottomCurve` | độ cong mí dưới (cong lên tạo "mắt cười") | −1..1 |
| `pupil` | cỡ đồng tử (0 = không vẽ, dùng cho style mắt khối đặc) | 0–1 |
| `pupilX`, `pupilY` | hướng nhìn | −1..1 |
| `irisHue`, `glow` | màu và cường độ phát sáng | |
| `shine` | độ mạnh highlight long lanh | 0–1 |
| `wobble` | rung (lạnh/sợ/khóc) | 0–1 |
| `shape` | đặc biệt: `normal` · `heart` · `star` · `spiral` · `x` · `arc` (`^`) · `line` (`—`) · `dot` | enum, đổi bằng morph |

Hai mắt có tham số **riêng** (`left`, `right`) để làm được nháy mắt, nhướn một bên, nghi ngờ (một mắt híp).

### 3.1b Miệng (`eyes/mouth.js` — tham số `mouth` trong cùng preset)

Miệng **nhỏ và nhu mì**: rộng khoảng 18–28% khoảng cách giữa hai mắt, đặt chính giữa, hơi thấp hơn đáy mắt (khoảng 0.55 chiều cao mắt). Cùng màu với mắt nhưng glow yếu hơn, nét mảnh có bo đầu tròn. Miệng không bao giờ được to hơn hoặc nổi hơn mắt; nhìn tổng thể vẫn phải là "đôi mắt có cái miệng xinh".

| Tham số | Ý nghĩa | Khoảng |
|---|---|---|
| `mw` | độ rộng (theo đơn vị miệng gốc) | 0.3–1.4 |
| `curve` | độ cong: dương = cười, âm = mếu | −1..1 |
| `open` | độ há: 0 là một nét, > 0 thành khối có lòng miệng tối | 0–1 |
| `round` | độ tròn khi há: 0 = há ngang, 1 = chữ `o` | 0–1 |
| `skew` | lệch một bên (nhếch mép, cười đểu) | −1..1 |
| `mx`, `my` | lệch vị trí nhỏ (nhai thì nhún, giận thì mím lệch) | −1..1 |
| `tongue` | lưỡi nhỏ hồng thè ra (ngon, tinh nghịch) | 0–1 |
| `wobble` | run môi (sắp khóc, lạnh) | 0–1 |
| `shape` | đặc biệt: `line` · `smile` · `cat` (`ω`) · `o` · `zigzag` (rối/say) · `triangle` (há cười tươi) · `dot` | enum, đổi bằng morph như mắt |

Hành vi của miệng:
- **Cười:** `happy` thì nét cong nhẹ; `joy` thì há tam giác bo tròn; `love`/`blush` thì miệng mèo `ω`.
- **Nhu mì (mặc định của `neutral`):** nét cong rất nhẹ, hơi hẹp, mép lâu lâu nhích một chút theo nhịp thở, thỉnh thoảng mím môi.
- **Ăn:** chờ đồ ăn thì há `o` rộng dần khi món được kéo lại gần; cắn vào thì đóng nhanh có overshoot. Khi nhai: `open` dao động theo nhịp 3–4 Hz, `mx` lệch qua lại, vụn rơi ra từ khóe miệng. Ăn xong liếm mép (`tongue` lóe 300 ms).
- **Uống:** miệng chu nhỏ chữ `o`; mỗi ngụm ực là `round` co lại rồi nhả ra, bong bóng bay từ miệng lên.
- **Nói / nhại giọng / chirp:** `open` bám envelope biên độ âm thanh, nên miệng nhép theo giọng nhại và tiếng bíp.
- **Ngáp:** há `o` chậm, to dần trong 1.2 s, mắt nhắm theo, rồi khép lại.
- **Buồn / khóc:** mếu (`curve` âm) + `wobble`; giận thì mím thành nét ngắn hơi lệch; ngạc nhiên thì há `o` nhỏ; chóng mặt thì `zigzag`; ngủ thì một nét cong hé nhẹ, thở chậm (thỉnh thoảng có bong bóng ngủ).

Miệng cũng đi qua spring như mắt (nhóm riêng: nhanh cho cắn và nói, mềm cho cười).

### 3.2 Renderer (`eyes/renderer.js`)

- Canvas full màn hình, DPR tối đa 2, nền gần đen (`#05070a`) có vignette rất nhẹ.
- Khối mắt là rounded-rect/oval dựng bằng path; mí trên và mí dưới là **mặt nạ cắt** (clip) dạng bezier có góc nghiêng và độ cong, nên một bộ tham số liên tục cho ra mọi trạng thái từ mở tròn → híp giận → cười `^ ^`.
- **Chiều sâu (3–4 lớp parallax):**
  1. Quầng glow phía sau, dịch ít nhất.
  2. Khối mắt, có gradient tỏa từ tâm (sáng ở giữa, tối ở rìa) giả độ cầu.
  3. Đồng tử/mống mắt có vân vòng tròn rất nhẹ, dịch theo `pupilX/Y`.
  4. Highlight long lanh: một đốm lớn và một đốm nhỏ, dịch **ngược** theo độ nghiêng máy, nên khi nghiêng điện thoại mắt như hình cầu đang bắt sáng thật.
- Glow dùng `shadowBlur` vẽ vào offscreen canvas cỡ nửa độ phân giải rồi `drawImage` phủ lên để giữ 60 fps.
- Squash & stretch: chớp mắt thì `h` co và `w` nở ra khoảng 8%; ngạc nhiên thì giãn dọc rồi overshoot.
- Morph `shape`: khi đổi sang tim/sao/xoắn ốc thì khối mắt co về `dot`, đổi hình, rồi nở ra (pop) khoảng 180 ms. Không cắt cảnh.
- Theme màu (cài đặt): Cyan (mặc định) · Hồng · Hổ phách · Xanh lá · Trắng · Cầu vồng (hue trôi chậm). Một số biểu cảm được quyền đổi màu tạm thời: giận ngả đỏ, buồn ngả xanh lam, yêu ngả hồng.

### 3.3 Lớp "sống" (`eyes/animator.js`) chồng lên preset

| Lớp | Hành vi |
|---|---|
| Thở | `h` dao động ±1.5%, chu kỳ 3.5–5 s; chậm hơn khi buồn ngủ, nhanh hơn khi phấn khích |
| Chớp | ngẫu nhiên mỗi 2–6 s, 15% là chớp đôi, chớp ~120 ms; buồn ngủ thì chớp chậm và nặng mí |
| Micro-saccade | cứ 0.4–1.5 s giật hướng nhìn một đoạn nhỏ quanh mục tiêu |
| Liếc khám phá | idle lâu thì thỉnh thoảng nhìn sang góc màn hình, rồi quay lại người dùng |
| Look-at | mục tiêu nhìn theo thứ tự ưu tiên: ngón tay đang chạm > khuôn mặt hoặc chuyển động từ camera > hướng nghiêng máy > hướng Bắc (chế độ la bàn) > tự do |
| Trễ hai mắt | mắt phải theo sau mắt trái 15–40 ms, thỉnh thoảng hơi lệch biên độ |
| Rung | `wobble` cộng nhiễu kiểu Perlin vào x/y |

Spring: mỗi tham số có `stiffness/damping` riêng theo nhóm (mí nhanh, kích thước vừa, vị trí mềm). Mỗi preset được phép ghi đè spring, ví dụ "giật mình" thì cứng và overshoot mạnh, "buồn ngủ" thì mềm và chậm.

### 3.4 Bộ biểu cảm (`eyes/expressions.js`) — tối thiểu 26

`neutral` · `happy` · `joy` (`^ ^` + nảy) · `love` (mắt tim + tim bay) · `excited` (mắt sao + lấp lánh) · `wink` · `smug` · `curious` (một mắt to, nghiêng) · `suspicious` (híp, liếc ngang) · `surprised` · `shocked` (co nhỏ + `!`) · `scared` (co nhỏ + rung + mồ hôi) · `sad` (mí nghiêng buồn) · `cry` (nước mắt rơi) · `angry` (mí nghiêng vào + đỏ + gân) · `annoyed` (`—` nửa mắt) · `confused` (lệch cỡ + `?`) · `dizzy` (xoắn ốc xoay) · `sleepy` (mí nặng + ngáp) · `sleeping` (`—` + Zzz + thở chậm) · `hungry` (liếc về phía khay đồ ăn + long lanh) · `thirsty` · `eating` (nhai: mắt cười nhún theo nhịp) · `drinking` (ực ực: mắt nhắm khoan khoái + bong bóng) · `cold` (rung + hơi thở trắng) · `hot` (híp + mồ hôi) · `cool` (kính râm) · `rainy` (ô nhỏ + mắt lim dim) · `blush` (má hồng dưới mắt) · `bored` · `focus`/`scanning` (đồng tử dò ngang, có vạch scan) · `glitch` (bị lắc quá mạnh: mắt nhiễu RGB lệch kênh 300 ms).

Mỗi preset là **dữ liệu**: `{left, right, mouth, fx?, spring?, colorShift?, loop?}`. Mọi preset bắt buộc có `mouth` hợp lệ theo §3.1b. `loop` mô tả animation lặp riêng của preset (nhai, nảy, xoay xoắn ốc, nhép miệng).

## 4. Não (brain)

### 4.1 Nhu cầu (`needs.js`)
`hunger` · `thirst` · `energy` · `affection` · `fun`, giá trị 0..1 (1 = đủ). Decay theo **thời gian thực** (lưu `lastSeen`). Khi app tắt vẫn tính decay, nhưng chặn sàn ở 0.15 để mở app lại không thấy pet tụt về 0. Tốc độ (giờ để từ 1 về 0.3): đói 6 h · khát 4 h · thương 5 h · vui 3 h. Năng lượng giảm khi thức và hồi khi ngủ, có nhịp theo giờ: tối muộn buồn ngủ, sáng tỉnh.

### 4.2 Tâm trạng (`mood.js`)
Vector `valence` (−1..1) và `arousal` (0..1) bám mượt theo nhu cầu và các sự kiện gần đây. Biểu cảm **nền** chọn từ mood bằng bảng vùng: valence cao + arousal cao → `excited`/`joy`; valence thấp + arousal thấp → `sad`/`bored`… Nhu cầu nào thấp hơn 0.3 thì chèn biểu cảm của nhu cầu đó (`hungry`, `thirsty`, `sleepy`) theo chu kỳ.

### 4.3 Phản xạ (`reactions.js`)
Sự kiện tạo intent có `priority` + `duration` + `cooldown`. **Habituation:** lặp lại cùng một kích thích liên tục thì phản ứng đổi dần. Ví dụ chọc mắt: lần 1 giật mình → lần 3 nghi ngờ → lần 6 bực → lần 10 giận rồi quay đi (mắt dời ra mép màn). Ngừng chọc khoảng 20 s thì quên dần.

### 4.4 Bảng tương tác (rule brain, không cần LLM)

| Đầu vào | Phản ứng |
|---|---|
| Chạm 1 lần vào mắt | `surprised` → chớp; theo habituation như §4.3 |
| Chạm ngoài mắt | mắt nhìn tới điểm chạm, có tò mò |
| Kéo ngón tay | mắt dõi theo ngón tay |
| **Nựng:** vuốt qua lại vùng trên mắt ≥ 3 lần | `happy` → `love`, tiếng gừ gừ robot, rung nhẹ, `affection` tăng |
| Đặt hai ngón lâu (ôm) | `blush` + `love` |
| **Cho ăn:** kéo món từ khay lên mắt (bánh quy, pin, ốc vít, kem, sushi, cà rốt) | mở mắt chờ → `eating` với nhịp nhai + vụn → `joy`; mỗi món tăng đói/vui khác nhau; no rồi vẫn cho ăn thì `annoyed` và lắc đầu (mắt dịch trái phải) |
| **Cho uống:** kéo ly nước, hoặc nghiêng máy kiểu rót khi ly đã đặt | `drinking` + bong bóng + tiếng ực ực |
| Lắc máy nhẹ | `excited` (tưởng đang chơi) |
| Lắc mạnh/lâu | `dizzy` → `glitch` → về `annoyed` |
| Rơi tự do (gia tốc ≈ 0 trong > 120 ms) | `shocked` + tiếng hét bíp; chạm đất xong thì `dizzy` |
| Úp mặt máy xuống | `sleeping` (tối màn, giảm fps để tiết kiệm pin) |
| Lật ngược máy | `confused` → mắt xoay để giữ hướng đúng chiều trọng lực |
| Nghiêng máy | đồng tử và highlight trượt theo trọng lực (parallax) |
| Bước chân (đang đi bộ, có nhịp gia tốc) | mắt nảy theo bước, `happy` "đi dạo"; tăng `fun` |
| La bàn (chế độ bật) | đồng tử chỉ về hướng Bắc; hướng về nhà thì có chấm nhỏ chỉ hướng |
| GPS: chỗ mới, cách các điểm đã lưu > 300 m | `curious` → `excited`, lưu nơi đã đến (tối đa 50, chỉ ở localStorage) |
| GPS: về gần "nhà" | `joy` "về nhà rồi" |
| Thời tiết mưa | `rainy` (ô) theo chu kỳ |
| Nắng nóng > 33 °C | `hot` |
| Lạnh < 15 °C | `cold` |
| Trời quang, ban ngày, vui | thỉnh thoảng đeo `cool` (kính râm) |
| Đêm (sau hoàng hôn từ API + 3 h) | buồn ngủ dần, mắt tối và ấm lại |
| Camera: có mặt người | nhìn thẳng vào mặt, `happy`; mặt lại gần thì `blush` |
| Camera: mặt biến mất lâu | `sad` nhẹ, rồi nhìn quanh tìm |
| Camera: che ống kính rồi mở ra (ú òa) | `surprised` → `joy` + cười bíp; tăng `fun` |
| Camera: tối hẳn | `sleepy` |
| Camera: có chuyển động | nhìn theo tâm vùng chuyển động |
| Camera: **bắt chước** (nếu có landmark) | mỉm cười / nháy mắt / há miệng ngạc nhiên thì pet làm theo |
| Mic: tiếng to đột ngột / vỗ tay | `surprised`; vỗ 2 lần thì `excited` |
| Mic: yên lặng lâu (ban đêm) | ngủ sớm hơn |
| **Nhại giọng:** giữ nút mic để nói | mắt `focus` nghe (đồng tử co giãn theo âm lượng) → thả nút: phát lại giọng chipmunk-robot, mắt nhép theo biên độ |
| Pin < 20% | `sleepy`/`hungry` "đói điện" |
| Đang sạc | `eating` kiểu "uống điện" lúc mới cắm → `happy` |
| Không ai chạm > 2 phút | `bored` → ngủ gật nếu `energy` thấp |
| Gọi tên pet (Web Speech, tùy chọn) | quay sang nhìn, `happy` |
| Lệnh giọng nói: "ngủ đi", "dậy đi", "ăn không", "nhìn tao/nhìn anh", "nhảy đi", "giận à" | intent tương ứng |

### 4.5 Tiếng (`audio/chirp.js`)
Tổng hợp bằng oscillator, không file âm thanh. Mỗi cảm xúc có "ngữ điệu" riêng: vui là chuỗi bíp đi lên, buồn là trượt xuống chậm, giật mình là một bíp cao ngắn, gừ gừ là sóng FM tần số thấp có tremolo, nhai là click nhịp, ực ực là sóng sin trượt có bong bóng. Tiếng đi qua bộ nén nhẹ. Có nút tắt tiếng; mặc định bật sau khi người dùng chạm lần đầu (luật autoplay).

### 4.6 Nhại giọng (`audio/mimic.js`)
Thu tối đa 6 s, phát lại `playbackRate` 1.5–1.8 (chipmunk), cộng ring-modulation khoảng 30 Hz và bit-crush nhẹ cho ra chất robot. Cài đặt có 3 preset: Chipmunk · Robot · Trầm. Mắt nhép theo envelope biên độ. Không lưu bản ghi sau khi phát.

## 5. Khe LLM tùy chọn (`brain/llm.js`)

- Cài đặt: provider `none` (mặc định) · `anthropic` · `openai-compatible` (OpenAI, OpenRouter, Ollama/LM Studio trong LAN…) · `gemini`; nhập `baseUrl`, `apiKey`, `model`. Key chỉ lưu localStorage trên máy, có cảnh báo rõ. Anthropic gọi thẳng từ trình duyệt bằng header `anthropic-dangerous-direct-browser-access: true`; Claude **luôn** chạy `claude-haiku-5-5` (nhanh, rẻ), kể cả Claude có sẵn khi chạy trong artifact claude.ai (provider `claude-artifact`, không cần key); ô Model chỉ áp cho OpenAI-compatible và Gemini.
- Khi nào gọi: người dùng nói chuyện (Web Speech hoặc ô gõ chữ), và thỉnh thoảng "độc thoại" (tối đa 1 lần mỗi 10 phút, có thể tắt) để bình luận thời tiết hoặc chỗ mới.
- Gửi ngữ cảnh gọn: nhu cầu, mood, giờ, thời tiết, cảm biến gần đây, 6 lượt hội thoại cuối, tên pet, câu người dùng nói.
- System prompt: pet là robot nhỏ dễ thương, nói tiếng Việt cực ngắn (≤ 12 từ), có thể chỉ đáp bằng "bíp". **Bắt buộc** trả JSON:
  `{"expression": "<một id trong bảng>", "intensity": 0..1, "duration_ms": 500..8000, "say": "…", "sound": "<id chirp>", "action": "none|sleep|wake|dance|look_around|follow_face"}`
- **Validator đứng trên LLM:** parse lỗi, id lạ hoặc số ngoài khoảng thì clamp hay bỏ, rồi fallback về rule brain. LLM không bao giờ trực tiếp sửa nhu cầu. Timeout 8 s; mất mạng thì im lặng dùng rule brain.
- `say` hiện trong bong bóng chữ nhỏ phía dưới mắt, mờ dần; TTS giọng robot là tùy chọn (pitch cao, tốc độ nhanh).

## 6. UI

- Màn chính: chỉ có hai mắt. Không HUD thường trực.
- **Vuốt lên từ đáy** (hoặc chạm nút tròn mờ ở góc) mở drawer: 🍪 Ăn · 💧 Uống · 🎙️ Nhại giọng · 🧭 La bàn · 📷 Camera · ⚙️ Cài đặt. Đầu drawer có 5 vạch nhu cầu nhỏ.
- Khay ăn/uống: món nằm thành hàng, kéo lên vùng mắt để cho ăn.
- Onboarding lần đầu: màn đen → mắt mở từ từ → nút "Đánh thức Pipo" (cử chỉ người dùng dùng để xin quyền motion trên iOS và mở audio) → đặt tên pet → chọn màu mắt. Quyền camera, mic, GPS chỉ xin khi người dùng bật tính năng tương ứng.
- **Chế độ kiểng:** Wake Lock giữ màn hình sáng, ban đêm tự giảm sáng (vẽ mờ đi), hiện giờ bằng mắt (đồng tử chuyển thành chữ số giờ:phút khoảng 3 s) khi chạm đúp.
- **Cài như app** (`ui/install.js`): manifest `display: fullscreen` + `display_override [fullscreen, standalone]`, icon PNG nhúng data URI (`tools/make_icons.py`). Bắt `beforeinstallprompt` để hiện nút "📲 Cài như app" (góc trái, ẩn được) và nút trong Cài đặt → Ứng dụng; iOS không có prompt nên hiện hướng dẫn "Chia sẻ → Thêm vào Màn hình chính". Chạy trong tab thì có Fullscreen API (nút + tùy chọn tự bật khi chạm). Đang chạy như app (`display-mode` standalone/fullscreen hoặc `navigator.standalone`) thì ẩn hết.
- Cài đặt: tên, màu mắt, style mắt (Khối đặc kiểu robot / Có đồng tử), âm thanh, rung, từng cảm biến bật/tắt, giọng nhại, LLM, đặt "nhà" bằng GPS hiện tại, xóa dữ liệu.
- `?debug=1`: bảng chọn mọi biểu cảm, slider nhu cầu, nút giả lập sự kiện cảm biến (lắc, rơi, mưa, mặt người…) để test trên desktop. `?gallery=1`: tự lướt qua mọi biểu cảm, mỗi cái 1.5 s.

## 7. Kỹ thuật & giới hạn nền tảng

- Cảm biến cần HTTPS (localhost thì được). iOS: `DeviceOrientationEvent.requestPermission()` phải gọi trong cử chỉ người dùng.
- `FaceDetector` chỉ có trên một số Chrome Android. Không có thì dùng camera ở chế độ độ sáng + chuyển động (frame 64×48, so khác biệt giữa các frame). Bắt chước nét mặt dùng MediaPipe Face Landmarker tải lười từ jsDelivr (phiên bản cố định), chỉ tải khi bật "Bắt chước"; tải lỗi thì tắt tính năng này, không crash.
- Thời tiết: `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&timezone=auto`.
- Hiệu năng: 60 fps trên máy tầm trung; khi ngủ hoặc ẩn tab hạ còn 20 fps và tạm dừng camera/mic.
- Lưu trữ: chỉ localStorage (bọc try/catch), không gửi dữ liệu đi đâu ngoài Open-Meteo và LLM người dùng tự cấu hình.

## 8. Tiêu chí nghiệm thu

1. `node --test robo-pet/test/` pass: spring hội tụ; mọi preset (mắt và miệng) hợp lệ với schema và nằm trong khoảng; needs decay đúng và có sàn; habituation leo thang; rule brain map sự kiện → intent; validator LLM chặn được JSON hỏng, id lạ, số ngoài khoảng.
2. Mở `index.html?gallery=1` trên Chromium headless: không lỗi console; chụp ảnh từng biểu cảm thì hai mắt khác nhau rõ.
3. Desktop không có cảm biến: chạy được hết, cảm biến báo "không hỗ trợ".
4. Không có file ảnh hay âm thanh nào; tổng mã nguồn < 400 KB.

## 9. Skin & Pose

**Skin** ("Giao diện", `store.data.skin`) là cách vẽ *thân* Pipo, khác `theme` (màu mắt) và `style` (kiểu mắt) — hai thứ đó áp cho mọi skin. Renderer giữ một skin hiện hành (`setSkin`): `computeGeom(frame, pose)` lấy hình học gốc rồi cho `skin.geom` chỉnh (giữ nguyên cấu trúc vì chạm/cho ăn/hạt hiệu ứng dùng chung), `draw` gọi `skin.draw` vẽ toàn cảnh. Hàm vẽ một khuôn mặt (glow + hạt sau + mắt + miệng + nhiễu + hạt trước, có tuỳ chọn cắt vào một vùng) là helper dùng chung `drawFace`. Contract và cách thêm skin: README §"Thêm skin mới" và JSDoc `src/skins/index.js`.

- `classic`: hành vi gốc, thêm nhún/lắc/nghiêng/ép theo pose.
- `pixel` (ma trận LED): mặt dựng (không glow, không bóng đổ, nét miệng dày hơn và miệng rộng hơn) vào canvas offscreen ~34 ô trên một đơn vị khổ mặt, `getImageData`, rồi vẽ từng ô thành chấm LED: độ sáng theo mẫu, màu theo màu mẫu (nên tim hồng, má hồng vẫn đúng màu), ô tắt là lưới "ma" dựng sẵn một lần, quầng sáng bằng cách phóng to mượt canvas thấp rồi cộng sáng. Cache theo kích thước màn trong `resize`.
- `eve`: đầu trứng ngang + kính mặt đen chứa đôi mắt của engine (thu nhỏ về khổ `1.78u`, mắt và miệng cắt trong kính, hạt/phụ kiện không bị cắt), thân trứng thuôn dưới, hai tay hình lá (xương sống uốn theo `curl`), đèn ngực và vòng cổ phát sáng theo màu mắt. `geom` trả mặt trong kính nên chạm/cho ăn/hạt đúng chỗ. Đầu bám pose sát, thân trễ pha bằng lò xo mềm nên nhún lệch nhẹ; cả robot bay lơ lửng (`hover`) trên bóng elip co giãn theo độ cao. Tay thấp vẽ trước đầu, tay giơ cao (che mặt, gãi đầu) vẽ sau đầu; chiều dài tay bị rút khi dang ngang và kẹp theo mép màn để vừa cả màn dọc lẫn ngang.

**Pose** (`eyes/body.js`, thuần logic): `Body.update(dt, {expression, dance, t}) → {bob, sway, tilt, squash, hover, armL:{lift,spread,curl}, armR}` bằng lò xo (cứng hơn khi nhảy để bám nhịp, pha được đẩy tới trước bù độ trễ lò xo). `bob/sway/hover` theo phần của `U` (bob dương = hạ xuống), `tilt` radian, `squash` ~ ±0.15; tay: `lift` −1 rủ … +1 giơ thẳng, `spread` −1 khép/chéo vào … +1 dang ra, `curl` cuộn đầu tay vào. Ngoài lúc nhảy, tay theo bảng biểu cảm (`ARM_POSES`) cộng ngọ nguậy; thân theo `BODY_EXPR` (nảy khi vui, chùng khi buồn, rung khi sợ/lạnh). Mọi skin áp `bob/sway/tilt/squash`; chỉ skin có tay dùng `arm*`.

## 10. Nghe nhạc & nhảy

Luồng: `micro → AnalyserNode (FFT 2048, không làm mượt) mỗi 20 ms → BeatTracker → DanceDirector → Body/animator/fx`.

1. **Onset** (`audio/beat.js`): phổ dB → tuyến tính → nén log `ln(1+300·m)`; spectral flux chỉ phần tăng (max-filter ±1 bin chống rung) theo ba dải kick 40–160 Hz · giữa 160–2k · cao 2k–8k, trọng số 1.5 / 0.6 / 0.35; trừ nền trung bình trượt 1 s; chuẩn hóa thích nghi theo đỉnh trôi 6 s có sàn tuyệt đối (nhiễu nền không bị khuếch đại). Ghi vào lưới 50 Hz.
2. **Tempo**: tự tương quan trên ~7 s onset, chấm điểm từng lag 70–187 BPM bằng tổng lược `r(l)+½r(2l)+¼r(3l)` nhân ưu tiên log-Gauss quanh 120 BPM (khử nhầm nửa/đôi; cộng khối lượng đỉnh trong ±1 ô vì lưới 50 Hz xẻ chu kỳ lẻ vào hai ô kề), tinh chỉnh bằng nội suy parabol ở các bội của lag. BPM làm mượt; chênh > 4 % chỉ đổi khi bền vững ≥ 2,5 s.
3. **Pha (PLL)**: lược nhịp trên onset gần nhất đo thời điểm nhịp thật; đồng hồ nhịp dự báo nhịp kế và bị kéo về (độ lợi 0.3) mỗi 0,24 s; bắn nhịp sớm ~30 ms (`lead`) để chuyển động đón trước. Cho `phase` 0..1 liên tục, `beatIndex`, `onBeat`; `stateAt(t)` ngoại suy pha giữa hai lần push.
4. **Nhận diện nhạc**: `confidence` = độ mạnh đỉnh tự tương quan (trung bình ở các bội lag) × cổng hoạt động (0,9 s gần nhất còn onset đáng kể, mức năng lượng trên nền). Trễ hai chiều: giữ ≥ 1,5 s mới `isMusic=true` (tổng ~3 s kể từ lúc nhạc bắt đầu), dưới ngưỡng ≥ 2,4 s mới `false`. Tiếng nói, nhiễu trắng, vỗ tay lẻ không thành nhạc.
5. **Dance director** (`brain/dance.js`): `notice` (~1,2 s, tò mò + `?` + liếc quanh) → `dance` → `outro` (~1,5 s, thỏa mãn) khi nhạc tắt. Động tác `bob · sway · step · tilt · hype` đổi mỗi 8 nhịp (ngẫu nhiên, `rng` tiêm vào, không lặp liền kề; `hype` chỉ khi năng lượng cao); biên độ theo năng lượng bài; bpm > 140 nhảy nửa tốc; năng lượng nhu cầu < 0,2 chỉ gật nhẹ với mắt lim dim; đang ngủ thì không nhảy. Body nhận `dance` để có squash đúng nhịp và tay vung theo động tác.
6. **Nối vào Pipo** (`main.js`): biểu cảm `groove` giữ liên tục bằng một overlay gắn thẻ (không phát lại mỗi frame), miệng nhép theo năng lượng và nhịp (`o` ↔ cười), `jolt` nhỏ và nốt nhạc theo nhịp, nhạc kéo dài tăng `fun` rất chậm và trừ năng lượng rất nhẹ. Phản xạ có priority > 4 (chọc, nựng, ôm, cho ăn, lắc…) thắng, xong quay lại nhảy; phản xạ priority thấp bị bỏ qua khi đang nhảy. `mic:clap`, `mic:clap2`, `mic:loud` bị chặn khi có nhạc. Ẩn tab thì tạm dừng cảm biến.
7. **Debug**: nút "Giả lập nhạc 120 BPM" thay `sensors.music` bằng `SyntheticBeat` (cùng dạng state) để thử trên desktop/headless.


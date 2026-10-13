# Máy chủ nhận thống kê ẩn danh của Pipo

Cloudflare Worker nhỏ: nhận `POST /v1/collect` (hai loại gói: `active` và `day`), validate tất định, ghi vào **Workers Analytics Engine**. Không đọc và không lưu IP, User-Agent, cookie hay header định danh (chỉ đọc `Origin` để CORS). Phía Pipo: [`../../README.md`](../../README.md) mục "Thống kê ẩn danh".

Lưu ý trung thực: Cloudflare, như mọi CDN, nhìn thấy IP của kết nối ở tầng mạng của nó; Worker này không lấy, không ghi. Analytics Engine tự gắn thời điểm nhận (`timestamp`) vào mỗi dòng.

## Triển khai

1. Cần tài khoản Cloudflare và `wrangler` (`npm i -g wrangler` hoặc `npx wrangler`), đã `wrangler login`.
2. `cp wrangler.toml.example wrangler.toml`, sửa `ALLOWED_ORIGINS` thành origin trang Pipo của bạn (không có đường dẫn, không dấu `/` cuối; nhiều origin ngăn bằng dấu phẩy, ví dụ `https://ntnam2809.github.io`).
3. Bật Analytics Engine cho tài khoản (Dashboard ▸ Workers & Pages ▸ Analytics Engine) — dataset `pipo_telemetry` tự tạo ở lần ghi đầu.
4. `wrangler deploy`. Kiểm tra: `curl https://<worker>/v1/health` → `{"ok":true}`.
5. Đặt URL vào `robo-pet/src/config.js`: `export const TELEMETRY_ENDPOINT = 'https://<worker>/v1/collect';`, phát hành lại. (Không đặt thì Pipo không gửi gì.)
6. Thử một gói tay: `curl -i -X POST https://<worker>/v1/collect -H 'Origin: https://<origin của bạn>' -H 'Content-Type: text/plain' -d '{"v":1,"kind":"active","day":"<hôm nay UTC>","dsi":0,"a7":1,"a30":1,"mode":"browser","platform":"desktop","lang":"vi"}'` → `204`. Gói `day` thêm `skin`, `theme`, `sessions`, `minutes`, `ev`, `sensors`, `llm` (xem `validate.js`).
7. Muốn đọc dữ liệu bằng API SQL: tạo API token có quyền **Account Analytics: Read**, gọi `POST https://api.cloudflare.com/client/v4/accounts/<account_id>/analytics_engine/sql` với thân là câu SQL.

Dữ liệu thử nghiệm cục bộ: `wrangler dev` rồi `POST` tới `http://127.0.0.1:8787/v1/collect` với `Origin` nằm trong `ALLOWED_ORIGINS`.

## Giao thức

| | |
|---|---|
| `POST /v1/collect` | Thân JSON (gửi `Content-Type: text/plain` để trình duyệt không preflight), ≤ 2048 byte. `204` ghi được · `400` sai schema/ngày lệch · `403` origin lạ hoặc thiếu · `413` quá lớn · `503` thiếu binding `PIPO` |
| `OPTIONS /v1/collect` | Preflight; chỉ trả header CORS cho origin trong `ALLOWED_ORIGINS` (không bao giờ `*`) |
| `GET /v1/health` | `{"ok":true}` |

`validate.js` (thuần, test bằng `node --test`): `kind` bắt buộc (`active` hoặc `day`, mỗi loại một danh sách khóa cho phép; trường của `day` gửi kèm gói `active` bị bỏ); bỏ khóa lạ ở gốc và trong `ev`; số đếm ngoài bucket thì ép về cận dưới bucket gần nhất; sai kiểu/enum/ngày (ngoài ±2 ngày so với hôm nay UTC) thì loại cả gói. Gói được dựng lại từ đầu bằng đúng các khóa cho phép.

## Ánh xạ cột (Analytics Engine)

Dataset `pipo_telemetry`, mỗi gói là một dòng. `blob9` cho biết loại gói; mọi truy vấn phải lọc theo nó.

| Cột | Nội dung | `active` | `day` |
|---|---|---|---|
| `index1` | `day` (`YYYY-MM-DD`, ngày UTC của dữ liệu) | có | có |
| `blob1` | `day` | có | có |
| `blob2` | `mode`: `browser` / `standalone` | có | có |
| `blob3` | `platform`: `android` / `ios` / `desktop` / `other` | có | có |
| `blob4` | `lang` (2 ký tự, `xx` nếu không rõ) | có | có |
| `blob5` | `skin` | trống | có |
| `blob6` | `theme` (màu mắt) | trống | có |
| `blob7` | `llm`: `none` / `anthropic` / `openai-compatible` / `gemini` / `claude-artifact` / `other` | trống | có |
| `blob8` | `sensors`: id cảm biến bật, ngăn bằng dấu phẩy, theo thứ tự cố định (`motion,compass,geo,weather,camera,mic,battery,voice,mimicFace,music`) | trống | có |
| `blob9` | `kind`: `active` / `day` | `active` | `day` |
| `double1` | `v` (phiên bản schema) | có | có |
| `double2` | `day_num`: số ngày kể từ 1970-01-01 UTC (để làm toán ngày trong SQL) | có | có |
| `double3` | `dsi`: số ngày kể từ cài, 0..30, `31` = hơn 30 ngày hoặc máy dùng từ trước | có | có |
| `double4` | `a7`: số ngày đã mở trong 7 ngày gần nhất | có | có |
| `double5` | `a30` | có | có |
| `double6` | `sessions` (cận dưới bucket: 0 · 1 · 2 · 3 · 6 · 11) | không có | có |
| `double7` | `minutes` (cận dưới bucket: 0 · 1 · 3 · 6 · 16 · 31 · 61) | không có | có |
| `double8`–`double25` | số lần dùng theo thứ tự: `poke` · `pet` · `hug` · `feed` · `drink` · `mimic` · `chat_llm` · `music_on` · `dance` · `clock` · `settings_open` · `install_prompt` · `install_accepted` · `gesture` · `shot` · `hand_mirror` · `meet_start` · `meet_ok` (cận dưới bucket: 0 · 1 · 2 · 6 · 21) | không có | có |

Analytics Engine có thể lấy mẫu khi dữ liệu lớn: luôn dùng `SUM(_sample_interval)` thay cho `COUNT()`.

## Truy vấn mẫu

Cú pháp là SQL của Analytics Engine (dạng ClickHouse). Các câu dưới chưa chạy thử trên Analytics Engine thật; đối chiếu với tài liệu SQL của Analytics Engine khi triển khai. Bỏ `WHERE timestamp ...` nếu muốn xem toàn bộ.

**Người dùng hoạt động theo ngày (DAU = số gói `active`):**

```sql
SELECT blob1 AS day, SUM(_sample_interval) AS dau
FROM pipo_telemetry
WHERE blob9 = 'active' AND timestamp > NOW() - INTERVAL '40' DAY
GROUP BY day ORDER BY day
```

**Cài mới mỗi ngày (`active` với `dsi = 0`):**

```sql
SELECT blob1 AS day, SUM(_sample_interval) AS installs
FROM pipo_telemetry
WHERE blob9 = 'active' AND double3 = 0 AND timestamp > NOW() - INTERVAL '40' DAY
GROUP BY day ORDER BY day
```

**D1 / D7 / D30 theo cohort** (từ gói `active`; cohort = ngày cài = `day_num - dsi`; chỉ dòng `dsi ≤ 30` mới có ngày cài chính xác):

```sql
SELECT double2 - double3 AS cohort_day,
       SUM(IF(double3 = 0, _sample_interval, 0)) AS installs,
       SUM(IF(double3 = 1, _sample_interval, 0)) AS d1,
       SUM(IF(double3 = 7, _sample_interval, 0)) AS d7,
       SUM(IF(double3 = 30, _sample_interval, 0)) AS d30
FROM pipo_telemetry
WHERE blob9 = 'active' AND double3 <= 30 AND timestamp > NOW() - INTERVAL '70' DAY
GROUP BY cohort_day ORDER BY cohort_day
```

Tỉ lệ D*N* = `dN / installs` của cùng cohort (tính ở bước đọc kết quả). `cohort_day` là số ngày kể từ 1970-01-01; đổi sang ngày bằng `new Date(cohort_day * 86400000)`.

**Tỉ lệ dùng từng tính năng** (từ gói `day`: phần trăm gói trong 7 ngày gần nhất có dùng ít nhất 1 lần; đổi `double8`… theo bảng cột):

```sql
SELECT
  SUM(IF(double8 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS poke,
  SUM(IF(double9 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS pet,
  SUM(IF(double10 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS hug,
  SUM(IF(double11 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS feed,
  SUM(IF(double12 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS drink,
  SUM(IF(double13 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS mimic,
  SUM(IF(double14 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS chat_llm,
  SUM(IF(double15 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS music_on,
  SUM(IF(double16 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS dance,
  SUM(IF(double17 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS clock,
  SUM(IF(double18 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS settings_open,
  SUM(IF(double19 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS install_prompt,
  SUM(IF(double20 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS install_accepted,
  SUM(IF(double21 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS gesture,
  SUM(IF(double22 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS shot,
  SUM(IF(double23 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS hand_mirror,
  SUM(IF(double24 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS meet_start,
  SUM(IF(double25 > 0, _sample_interval, 0)) / SUM(_sample_interval) AS meet_ok
FROM pipo_telemetry
WHERE blob9 = 'day' AND timestamp > NOW() - INTERVAL '7' DAY
```

**Phân bố skin** (từ gói `day`, chỉ có ở những người quay lại):

```sql
SELECT blob5 AS skin, SUM(_sample_interval) AS packets
FROM pipo_telemetry
WHERE blob9 = 'day' AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY skin ORDER BY packets DESC
```

**Standalone so với browser** (từ gói `active`, tức mọi người dùng hoạt động):

```sql
SELECT blob2 AS mode, SUM(_sample_interval) AS packets
FROM pipo_telemetry
WHERE blob9 = 'active' AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY mode
```

## Đọc số liệu cho đúng

- **DAU, cài mới, D1/D7/D30 lấy từ gói `active`.** Gói này đi ngay lần mở đầu tiên mỗi ngày nên không phụ thuộc người dùng có quay lại: `installs` (active `dsi = 0`) gồm mọi người mới cài, và D*N* = số active `dsi = N` ngày X chia số active `dsi = 0` ngày X−N. Chỉ bị thiếu những lần mở mà gói không tới được (đang offline, chặn mạng, bật DNT/GPC, đã tắt thống kê).
- **Mức dùng tính năng, phân bố skin lấy từ gói `day`.** Gói này chỉ gửi khi người dùng mở/ẩn Pipo *sau khi* ngày dữ liệu kết thúc (trong vòng 2 ngày), nên nó là mẫu của những người quay lại, không phải mọi người dùng hoạt động. Dùng để so sánh tương đối giữa các tính năng, không dùng làm số tuyệt đối hay làm mẫu số cho retention.
- Máy dùng Pipo từ trước khi có thống kê (không rõ ngày cài) gửi `dsi = 31`; tách khỏi cohort bằng điều kiện `double3 <= 30`.

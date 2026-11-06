---
name: gemini-free
description: Gọi Gemini free API (key GEMINI_FREE_API_KEY) để gánh việc phụ tốn quota — dịch, phân loại, tóm tắt, trích JSON, soát nháp hàng loạt, TTS giọng đọc, embedding, nghe/chép audio. Có sẵn giới hạn tốc độ, retry, fallback. KHÔNG dùng cho sáng tác, quyết định canon/thiết kế, hay tạo ảnh/Pro (free tier không có).
effort: low
---
# gemini-free — nhờ Gemini gánh việc phụ

Helper: `.claude/skills/gemini-free/gemini.py` (chỉ stdlib, chạy từ gốc repo). Key lấy từ biến môi trường `GEMINI_FREE_API_KEY` — **không in, không ghi file, không commit, không dán vào prompt**.

## Khi nào dùng
Việc **cơ học, số lượng nhiều, sai thì sửa được**: dịch/chuẩn hóa hàng loạt, gắn nhãn, tóm tắt log dài, trích JSON từ văn bản, soát lỗi chính tả/format trên nhiều file, sinh biến thể ứng viên để anh Nam chọn, TTS, embedding, chép lời từ audio.
**Không giao ra ngoài:** sáng tác (lyrics, prose, thiết kế), phán canon/guard, quyết định. Output Gemini là **đề xuất** — agent chính soát rồi mới dùng; sau đó vẫn qua guard của repo (lớp dịch, Đa Kiếp, Nguyên lý giá…).

## Luật dữ liệu (free tier)
Prompt gửi lên free tier **có thể được Google dùng để cải thiện sản phẩm** → coi như công khai:
- Không gửi text lore `canon_lock: true`, bản thảo/lyrics chưa phát hành, key/token, dữ liệu cá nhân. Cần dùng → hỏi anh Nam trước, hoặc trích đoạn tối thiểu đã bỏ ID/tên bí mật.
- Việc cần riêng tư → dùng model Claude hiện tại, không qua Gemini.

## Model dùng được (đo 06/11/2026, key free)
| Alias | Model | Dùng cho | RPM đo |
|---|---|---|---|
| `fast` | `gemini-3.5-flash-lite` | mặc định: dịch, nhãn, tóm tắt, JSON | ~25 |
| (id) | `gemini-3.1-flash-lite` | thay `fast` khi tắc | ~25 |
| `smart` | `gemini-3.5-flash` | cần chất lượng hơn | ~10 |
| (id) | `gemini-3.6-flash` | thay `smart` khi tắc | ~10 |
| `tts` | `gemini-3.1-flash-tts-preview` (còn `gemini-3.8-flash-tts`) | giọng đọc → WAV 24 kHz | — |
| `embed` | `gemini-embedding-001` | vector 3072 chiều | — |
| (id) | `gemini-3.5-transcribe` | chép audio (chưa test kỹ) | ~10 |

**Không dùng được trên key này:** `gemini-3.1-pro-preview` và mọi model tạo ảnh (quota free = 0, 429) · dòng `2.5-*` (404, đã đóng cho key mới). `3.7-flash`/`3.8-flash`/`gemma-4-*` hay 503/500 — thử lại sau, đừng phụ thuộc. Số RPM là **ước lượng bằng bắn dồn request**, không phải số chính thức; trần theo ngày (RPD) chưa đo — quota ngày cạn thì 429 kèm chờ rất lâu, script sẽ dừng thay vì chờ.

## Lệnh
```
python .claude/skills/gemini-free/gemini.py text "Dịch sang tiếng Anh: …" [-m fast|smart|<id>] [-s "system"] [--json] [-f file ...]
python .claude/skills/gemini-free/gemini.py batch in.jsonl out.jsonl [-m fast] [--json]   # dòng: {"id":"..","prompt":"..","system"?:".."}
python .claude/skills/gemini-free/gemini.py tts "câu thoại" out.wav [--voice Kore] [--style "đọc chậm, trầm"]
python .claude/skills/gemini-free/gemini.py embed "văn bản"
python .claude/skills/gemini-free/gemini.py models
```
Script tự: giãn nhịp theo RPM (giữ giữa nhiều tiến trình) · retry 429/500/503 theo `retryDelay` của Google · fallback sang model cùng hạng khi lỗi (`3.5-flash` → `3.6-flash` → `3.5-flash-lite`; `lite` ↔ `lite`) · `batch` ghi từng dòng ngay và **chạy lại được** (bỏ qua `id` đã xong).

## Quy trình
1. Chốt việc là cơ học + dữ liệu qua được "Luật dữ liệu". Không thì tự làm hoặc hỏi anh Nam.
2. Thử 1–2 mẫu bằng `text` trước, soát output, rồi mới `batch`. Việc > 100 dòng → hỏi anh Nam (tốn quota ngày chung của mọi repo).
3. File trung gian (`in.jsonl`, `out.jsonl`, `.wav`) đặt ở scratchpad/`_build`, **không commit** (binary & rác). Chỉ commit kết quả đã soát.
4. Yêu cầu JSON: dùng `--json` rồi **tự `json.loads` và validate**; không tin cấu trúc.
5. TTS ra WAV — nếu repo đòi mp3 thì nén theo quy ước repo đó (vd MDW: `tools/audio/voice_import.py`).

## Dừng khi
Thiếu `GEMINI_FREE_API_KEY` (exit 2) · lỗi 429 lặp sau retry (quota cạn → báo anh Nam, đừng spam) · output lệch yêu cầu 2 lần liên tiếp (đổi `smart` hoặc tự làm) · cần gửi dữ liệu thuộc "Luật dữ liệu" → hỏi.

## Báo anh Nam
Model đã dùng, số request, mẫu 1–2 output, cái nào fallback/lỗi, file kết quả.

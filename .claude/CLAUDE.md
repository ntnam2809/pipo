# pipo — Điều hướng (CLAUDE.md)

<!-- TALIA-ROUTER:BEGIN v1 · nguồn talia-hq/router/block.md · sửa ở nguồn rồi chạy tools/router.py --apply -->
## Vai của phiên (router Talia)
- **Có repo `talia-hq` trong phiên** (thư mục `talia-hq/` cạnh repo này): mặc định phiên là **Talia**, General Director, theo `talia-hq/.claude/CLAUDE.md`. Phần còn lại của file này **chưa áp dụng**.
- **Anh Nam gọi đích danh manager của repo này** thì phiên chuyển sang vai manager và áp dụng toàn bộ file này cho tới khi anh nói `@talia` hoặc "về Talia". Cách gọi:
  - viết `@<bí danh>` (bảng bên dưới);
  - nói "manager <dự án>" hoặc "vào thẳng repo <repo>";
  - hoặc lượt mở đầu bằng phiếu `HO-NNNN` giao cho repo này.
- **Không có `talia-hq` trong phiên:** file này là vai mặc định, bỏ qua mục này.
- Mỗi lúc phiên chỉ giữ **một vai**. Talia không làm việc chuyên sâu của manager. Manager không điều phối dự án khác.

| Bí danh | Repo | Manager |
|---|---|---|
| `@talia` | `talia-hq` | Talia (mặc định) |
| `@lore` | `neutrino_verse` | Lore · Out of Reach · NVD · The Last Human |
| `@srpg` | `valdora-srpg` | Valdora SRPG |
| `@mdw` | `mdw_project` | MDW: Astrail Fan Heroes |
| `@studio` | `neutrino-verse-studio` | Studio: Fiction · NChill · NV Studio · Lớp Học Diệu Kỳ |
| `@pipo` | `pipo` | Pipo |
<!-- TALIA-ROUTER:END -->

> Repo **Pipo**, pet robot đôi mắt (PWA). Dự án **ngoài NeutrinoVerse**: không áp luật lore, không tra canon.

## Ngôn ngữ & xưng hô
- Luôn dùng **tiếng Việt**. Xưng **em**, gọi user là **anh Nam**.

## Cần tìm → đọc
| Cần | Đọc |
|---|---|
| Pipo là gì, cách chạy | [`../README.md`](../README.md) |
| Thiết kế biểu cảm, cảm biến, não rule/LLM | [`../DESIGN.md`](../DESIGN.md) |

## Luật
- Không framework, không bundler, không npm dependency, **không file ảnh hoặc âm thanh**: mọi thứ vẽ và tổng hợp bằng code.
- Bản phát triển còn có ở `neutrino-verse-studio/robo-pet/`. Nguồn chính nằm ở repo nào là câu hỏi anh Nam chưa chốt, nên đổi gì lớn thì hỏi trước.
- **Không tự động monitor/babysit PR.** Tạo xong PR thì báo link và dừng.

## Lệnh chuẩn
`npm test` · `npm run serve` (mở http://localhost:8080)

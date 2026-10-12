"""Dựng trang Pipo cho artifact claude.ai từ index.html.

Artifact tự bọc trang bằng <!doctype>/<head>/<body>, nên trang chỉ giữ <title>, <style> và nội dung body;
bỏ manifest (CSP chặn). Module trong src/ được publish kèm bằng `files` (in danh sách ra stdout dạng JSON).

    python robo-pet/tools/build_artifact.py <thư-mục-ra>
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
out_dir = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "_artifact")
out_dir.mkdir(parents=True, exist_ok=True)

html = (ROOT / "index.html").read_text(encoding="utf-8")
title = re.search(r"<title>.*?</title>", html, re.S).group(0)
style = re.search(r"<style>.*?</style>", html, re.S).group(0)
body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)
(out_dir / "pipo.html").write_text(f"{title}\n{style}\n{body.strip()}\n", encoding="utf-8")

files = {p.relative_to(ROOT).as_posix(): p.relative_to(ROOT).as_posix() for p in sorted((ROOT / "src").rglob("*.js"))}
print(json.dumps(files, ensure_ascii=False))

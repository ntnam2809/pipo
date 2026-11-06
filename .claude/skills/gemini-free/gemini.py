#!/usr/bin/env python3
"""Gemini free tier — helper dùng chung cho hệ sinh thái NeutrinoVerse (chỉ stdlib).

Key đọc từ biến môi trường GEMINI_FREE_API_KEY (không bao giờ in ra, không ghi file).

  python gemini.py models                                   # model + nhóm + RPM ước tính
  python gemini.py text  "prompt" [-m fast|smart|<id>] [-s "system"] [--json] [-f file ...]
  python gemini.py batch in.jsonl out.jsonl [-m fast]       # mỗi dòng {"id":..,"prompt":..,"system"?:..}
  python gemini.py tts   "câu thoại" out.wav [--voice Kore] [-m tts] [--style "đọc chậm, trầm"]
  python gemini.py embed "văn bản" [-m embed]               # in số chiều + 5 giá trị đầu
Thoát: 0 OK · 1 lỗi gọi API · 2 thiếu key/tham số.
"""
import argparse, base64, json, os, re, sys, time, wave, urllib.request, urllib.error, tempfile

BASE = "https://generativelanguage.googleapis.com/v1beta/models/"
# RPM đo thực tế 11/2026 (free tier, không phải số chính thức) → khoảng cách tối thiểu giữa 2 lần gọi.
RPM = {"gemini-3.5-flash-lite": 25, "gemini-3.1-flash-lite": 25, "gemini-3.5-flash": 10,
       "gemini-3.6-flash": 10, "gemini-3.5-transcribe": 10}
ALIAS = {"fast": "gemini-3.5-flash-lite", "smart": "gemini-3.5-flash",
         "tts": "gemini-3.1-flash-tts-preview", "embed": "gemini-embedding-001"}
# Hết quota/quá tải một model → thử model kế (chỉ cho text).
FALLBACK = {"gemini-3.5-flash": ["gemini-3.6-flash", "gemini-3.5-flash-lite"],
            "gemini-3.6-flash": ["gemini-3.5-flash", "gemini-3.5-flash-lite"],
            "gemini-3.5-flash-lite": ["gemini-3.1-flash-lite"],
            "gemini-3.1-flash-lite": ["gemini-3.5-flash-lite"]}
STATE = os.path.join(tempfile.gettempdir(), "gemini_free_last_call.json")


def key():
    k = os.environ.get("GEMINI_FREE_API_KEY", "").strip()
    if not k:
        print("Thiếu biến môi trường GEMINI_FREE_API_KEY", file=sys.stderr)
        sys.exit(2)
    return k


def throttle(model):
    """Giữ khoảng cách tối thiểu giữa các lần gọi cùng model, kể cả giữa nhiều tiến trình."""
    gap = 60.0 / RPM.get(model, 10) * 1.1
    try:
        st = json.load(open(STATE))
    except Exception:
        st = {}
    wait = st.get(model, 0) + gap - time.time()
    if wait > 0:
        time.sleep(wait)
    st[model] = time.time()
    try:
        json.dump(st, open(STATE, "w"))
    except Exception:
        pass


def call(model, body, method="generateContent", tries=4):
    """POST có retry: 429/500/503 chờ theo retryDelay của Google (hoặc 2-4-8-16s)."""
    k = key()
    last = (0, "")
    for i in range(tries):
        throttle(model)
        req = urllib.request.Request(BASE + model + ":" + method, json.dumps(body).encode(),
                                     {"x-goog-api-key": k, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "replace")
            msg = raw
            delay = 2 ** (i + 1)
            try:
                err = json.loads(raw)["error"]
                msg = err.get("message", raw)
                for d in err.get("details", []):
                    m = re.match(r"([\d.]+)s", str(d.get("retryDelay", "")))
                    if m:
                        delay = float(m.group(1)) + 1
            except Exception:
                pass
            last = (e.code, msg.replace(k, "<key>")[:300])
            if e.code in (429, 500, 503) and i < tries - 1:
                if e.code == 429 and delay > 90:   # quota ngày: chờ vô ích
                    break
                print(f"[{model}] {e.code}, chờ {delay:.0f}s rồi thử lại ({i + 1}/{tries - 1})", file=sys.stderr)
                time.sleep(delay)
                continue
            break
        except Exception as e:
            last = (0, str(e).replace(k, "<key>"))
            time.sleep(2 ** (i + 1))
    raise RuntimeError(f"{model}: HTTP {last[0]} {last[1]}")


def part_of(path):
    import mimetypes
    mt = mimetypes.guess_type(path)[0] or "application/octet-stream"
    if mt.startswith("text/") or path.endswith((".md", ".json", ".yaml", ".yml", ".py", ".js")):
        return {"text": f"--- {os.path.basename(path)} ---\n" + open(path, encoding="utf-8").read()}
    return {"inlineData": {"mimeType": mt, "data": base64.b64encode(open(path, "rb").read()).decode()}}


def gen_text(prompt, model="fast", system=None, as_json=False, files=()):
    model = ALIAS.get(model, model)
    body = {"contents": [{"parts": [part_of(f) for f in files] + [{"text": prompt}]}]}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    if as_json:
        body["generationConfig"] = {"responseMimeType": "application/json"}
    chain = [model] + FALLBACK.get(model, [])
    for n, m in enumerate(chain):
        try:
            d = call(m, body)
            c = d["candidates"][0]
            if c.get("finishReason") not in (None, "STOP", "MAX_TOKENS"):
                raise RuntimeError(f"{m}: bị chặn ({c.get('finishReason')})")
            txt = "".join(p.get("text", "") for p in c["content"]["parts"])
            if n:
                print(f"[fallback] đã dùng {m}", file=sys.stderr)
            return txt
        except RuntimeError as e:
            if n == len(chain) - 1:
                raise
            print(f"[{m}] lỗi, chuyển {chain[n + 1]}: {str(e)[:120]}", file=sys.stderr)


def gen_tts(text, out, voice="Kore", model="tts", style=None):
    model = ALIAS.get(model, model)
    t = f"{style}: {text}" if style else text
    body = {"contents": [{"parts": [{"text": t}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    d = call(model, body)
    p = d["candidates"][0]["content"]["parts"][0]["inlineData"]
    rate = int((re.search(r"rate=(\d+)", p.get("mimeType", "")) or [0, 24000])[1])
    with wave.open(out, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(base64.b64decode(p["data"]))
    return out


def embed(text, model="embed"):
    model = ALIAS.get(model, model)
    return call(model, {"content": {"parts": [{"text": text}]}}, "embedContent")["embedding"]["values"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    sp.add_parser("models")
    t = sp.add_parser("text"); t.add_argument("prompt"); t.add_argument("-m", default="fast")
    t.add_argument("-s", "--system"); t.add_argument("--json", action="store_true"); t.add_argument("-f", nargs="*", default=[])
    b = sp.add_parser("batch"); b.add_argument("inp"); b.add_argument("out"); b.add_argument("-m", default="fast")
    b.add_argument("--json", action="store_true")
    s = sp.add_parser("tts"); s.add_argument("text"); s.add_argument("out"); s.add_argument("--voice", default="Kore")
    s.add_argument("-m", default="tts"); s.add_argument("--style")
    e = sp.add_parser("embed"); e.add_argument("text"); e.add_argument("-m", default="embed")
    a = ap.parse_args()
    try:
        if a.cmd == "models":
            for al, m in ALIAS.items():
                print(f"{al:6} -> {m}")
            for m, r in RPM.items():
                print(f"{m:26} ~{r} RPM (đo thực tế)")
        elif a.cmd == "text":
            print(gen_text(a.prompt, a.m, a.system, a.json, a.f))
        elif a.cmd == "batch":
            done = set()
            if os.path.exists(a.out):   # chạy lại được: bỏ qua id đã xong
                done = {json.loads(l)["id"] for l in open(a.out, encoding="utf-8") if l.strip()}
            with open(a.out, "a", encoding="utf-8") as fo:
                for l in open(a.inp, encoding="utf-8"):
                    if not l.strip():
                        continue
                    j = json.loads(l)
                    if j["id"] in done:
                        continue
                    r = gen_text(j["prompt"], a.m, j.get("system"), a.json)
                    fo.write(json.dumps({"id": j["id"], "output": r}, ensure_ascii=False) + "\n"); fo.flush()
                    print(f"ok {j['id']}", file=sys.stderr)
        elif a.cmd == "tts":
            print(gen_tts(a.text, a.out, a.voice, a.m, a.style))
        elif a.cmd == "embed":
            v = embed(a.text, a.m); print(len(v), [round(x, 4) for x in v[:5]])
    except RuntimeError as ex:
        print(f"LỖI: {ex}", file=sys.stderr); sys.exit(1)


if __name__ == "__main__":
    main()

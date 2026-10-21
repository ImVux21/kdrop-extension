"""Read supplied conversation SQLite without modifying it; emit selected protobuf text leaves."""
import sqlite3, re, sys

URI = 'file:///C:/Users/vuodo/.gemini/antigravity/conversations/59f9d440-8f8f-41fb-befb-c281bd7c5fbe.db?mode=ro&immutable=1'

def varint(buf, pos):
    value = shift = 0
    while pos < len(buf) and shift < 70:
        byte = buf[pos]; pos += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, pos
        shift += 7
    raise ValueError('Invalid varint')

def fields(buf):
    result = []; pos = 0
    while pos < len(buf):
        tag, pos = varint(buf, pos); number, wire = tag >> 3, tag & 7
        if not number: raise ValueError('Zero tag')
        if wire == 0: value, pos = varint(buf, pos)
        elif wire in (1, 5):
            size = 8 if wire == 1 else 4; value = buf[pos:pos+size]; pos += size
        elif wire == 2:
            size, pos = varint(buf, pos); value = buf[pos:pos+size]; pos += size
        else: raise ValueError('Unsupported wire')
        if pos > len(buf): raise ValueError('Truncated field')
        result.append((number, wire, value))
    return result

def text_leaves(buf, path='', depth=0):
    if depth > 12: return []
    try: parsed = fields(buf)
    except ValueError: return []
    result = []
    for number, wire, value in parsed:
        if wire != 2: continue
        child = path + '.' + str(number)
        try:
            text = value.decode('utf-8')
            if len(text) > 30 and sum(c.isprintable() or c in '\n\r\t' for c in text)/len(text) > .97:
                result.append((child, text)); continue
        except UnicodeDecodeError: pass
        result += text_leaves(value, child, depth+1)
    return result

def redact(text):
    # Context excerpts must not disclose credentials even when archived tool logs contain them.
    text = re.sub(r'(?i)(authorization|cookie|api[_-]?key|access[_-]?token|password)\s*[:=]\s*[^\n,}]+', r'\1: [REDACTED]', text)
    text = re.sub(r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b', '[REDACTED JWT]', text)
    return text

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    selected = set(map(int, sys.argv[1:]))
    db = sqlite3.connect(URI, uri=True)
    db.execute('PRAGMA query_only=ON')
    for idx, kind, payload in db.execute('SELECT idx,step_type,step_payload FROM steps ORDER BY idx'):
        if selected and idx not in selected: continue
        for path, text in text_leaves(payload or b''):
            if path not in ('.20.1', '.140.2.1', '.16.1', '.114.1'): continue
            if not selected and not re.search(r'homepage|trang ch[uủ]|banner|best.?sell|recommend|salesVolume|purchaseCount|rank|volume', text, re.I): continue
            print(f'\n## Step {idx} / type {kind} / field {path}\n{redact(text)}')

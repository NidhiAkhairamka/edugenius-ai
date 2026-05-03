import sqlite3, json
from pathlib import Path

conn = sqlite3.connect('edugenius.db')
conn.row_factory = sqlite3.Row

# Check actual table structures
print('=== TABLE STRUCTURES ===')
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
for t in tables:
    name = t[0]
    cols = conn.execute(f'PRAGMA table_info({name})').fetchall()
    print(f'{name}: {[c[1] for c in cols]}')

print()

# Check static files
print('=== STATIC FILES ===')
f = Path('data/curriculum.json')
if f.exists():
    c = json.loads(f.read_text(encoding='utf-8'))
    topic = c.get('m-y9-pythagoras', {})
    print('curriculum.json found')
    print('  overview:', topic.get('overview', 'MISSING')[:80])
    print('  concepts:', topic.get('concepts', ['MISSING'])[:2])
else:
    print('curriculum.json NOT FOUND')

f2 = Path('data/questions/m-y9-pythagoras.json')
if f2.exists():
    bank = json.loads(f2.read_text(encoding='utf-8'))
    for diff, qs in bank.items():
        print(f'  {diff}: {len(qs)} questions')
else:
    print('question bank NOT FOUND')

conn.close()
print('Done')

# Add to check.py
import urllib.request
try:
    url = 'http://localhost:5000/api/curriculum/static/m-y9-pythagoras'
    with urllib.request.urlopen(url, timeout=5) as r:
        data = json.loads(r.read())
        print('Flask static route works:')
        print('  overview:', data.get('overview','MISSING')[:60])
except Exception as e:
    print('Flask static route FAILED:', e)
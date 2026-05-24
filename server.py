from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os

# ── Database — PostgreSQL on Railway, SQLite locally ─────────────────────────
DATABASE_URL = os.environ.get('DATABASE_URL')

if DATABASE_URL:
    import psycopg2
    import psycopg2.extras

    def get_db():
        conn = psycopg2.connect(DATABASE_URL)
        return conn

    def db_execute(conn, sql, params=()):
        sql = sql.replace('?', '%s')
        sql = sql.replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'SERIAL PRIMARY KEY')
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql, params)
        return cur

    def row_to_dict(row):
        return dict(row) if row else None

    def rows_to_list(rows):
        return [dict(r) for r in rows]

    DB_TYPE = 'postgres'
    print("Database: PostgreSQL (Railway)")

else:
    import sqlite3

    def get_db():
        conn = sqlite3.connect('edugenius.db')
        conn.row_factory = sqlite3.Row
        return conn

    def db_execute(conn, sql, params=()):
        return conn.execute(sql, params)

    def row_to_dict(row):
        return dict(row) if row else None

    def rows_to_list(rows):
        return [dict(r) for r in rows]

    DB_TYPE = 'sqlite'
    print("Database: SQLite (local)")

# ── Static Question Bank ──────────────────────────────────────────────────────
import random as _random
from pathlib import Path as _Path

_DATA_DIR = _Path(__file__).parent / 'data'
_Q_DIR    = _DATA_DIR / 'questions'
_question_cache = {}
_curriculum_cache = None

def _load_curriculum_cache():
    global _curriculum_cache
    if _curriculum_cache is None:
        f = _DATA_DIR / 'curriculum.json'
        _curriculum_cache = json.loads(f.read_text(encoding='utf-8')) if f.exists() else {}
    return _curriculum_cache

def _load_question_bank(topic_id):
    if topic_id not in _question_cache:
        f = _Q_DIR / f'{topic_id}.json'
        _question_cache[topic_id] = json.loads(f.read_text(encoding='utf-8')) if f.exists() else {}
    return _question_cache.get(topic_id, {})

def get_static_curriculum(topic_id):
    return _load_curriculum_cache().get(topic_id)

def get_static_question(topic_id, difficulty, year, used_ids=None):
    used = set(used_ids or [])
    bank = _load_question_bank(topic_id)
    if not bank:
        return None
    questions = bank.get(difficulty, [])
    available = [q for q in questions if q.get('id') not in used]
    if not available:
        fallbacks = {
            'Beginner': ['Intermediate'],
            'Intermediate': ['Beginner', 'Advanced'],
            'Advanced': ['Intermediate']
        }
        for fb in fallbacks.get(difficulty, []):
            available = [q for q in bank.get(fb, []) if q.get('id') not in used]
            if available:
                break
    return _random.choice(available) if available else None

def get_bank_stats():
    if not _Q_DIR.exists():
        return {}
    return {
        f.stem: {d: len(qs) for d, qs in json.loads(
            f.read_text(encoding='utf-8')).items()}
        for f in _Q_DIR.glob('*.json')
    }

# ── App ───────────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ── DB Init ───────────────────────────────────────────────────────────────────
def init_db():
    conn = get_db()
    try:
        if DB_TYPE == 'postgres':
            cur = conn.cursor()
            cur.execute('''CREATE TABLE IF NOT EXISTS profiles (
                name TEXT PRIMARY KEY, data TEXT NOT NULL)''')
            cur.execute('''CREATE TABLE IF NOT EXISTS agent_eye_vault (
                id TEXT PRIMARY KEY, "studentName" TEXT, "topicId" TEXT, data TEXT NOT NULL)''')
            cur.execute('''CREATE TABLE IF NOT EXISTS briefing_vault (
                id TEXT PRIMARY KEY, "studentName" TEXT, "topicId" TEXT, data TEXT NOT NULL)''')
            cur.execute('''CREATE TABLE IF NOT EXISTS topic_synthesis (
                "studentName" TEXT, "topicId" TEXT, data TEXT NOT NULL,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY ("studentName", "topicId"))''')
            cur.execute('''CREATE TABLE IF NOT EXISTS flashcards (
                id SERIAL PRIMARY KEY, "studentName" TEXT, "topicId" TEXT,
                front TEXT, back TEXT, "masteryLevel" INTEGER DEFAULT 0)''')
            cur.execute('''CREATE TABLE IF NOT EXISTS curriculum_analysis (
                "topicId" TEXT PRIMARY KEY, subject TEXT, "yearLevel" INTEGER,
                "logicProfile" TEXT, "commonQuestions" TEXT,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
            cur.execute('''CREATE TABLE IF NOT EXISTS question_logs (
                id TEXT PRIMARY KEY, "studentName" TEXT, "topicId" TEXT,
                "questionText" TEXT, "userAnswer" TEXT, "isCorrect" INTEGER,
                feedback TEXT, subject TEXT, difficulty TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
            cur.execute('''CREATE TABLE IF NOT EXISTS mock_papers (
                id TEXT PRIMARY KEY, "studentName" TEXT,
                status TEXT DEFAULT 'ready', data TEXT NOT NULL,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
            conn.commit()
        else:
            conn.execute('CREATE TABLE IF NOT EXISTS profiles (name TEXT PRIMARY KEY, data TEXT NOT NULL)')
            conn.execute('CREATE TABLE IF NOT EXISTS agent_eye_vault (id TEXT PRIMARY KEY, studentName TEXT, topicId TEXT, data TEXT NOT NULL)')
            conn.execute('CREATE TABLE IF NOT EXISTS briefing_vault (id TEXT PRIMARY KEY, studentName TEXT, topicId TEXT, data TEXT NOT NULL)')
            conn.execute('''CREATE TABLE IF NOT EXISTS topic_synthesis (
                studentName TEXT, topicId TEXT, data TEXT NOT NULL,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (studentName, topicId))''')
            conn.execute('''CREATE TABLE IF NOT EXISTS flashcards (
                id INTEGER PRIMARY KEY AUTOINCREMENT, studentName TEXT,
                topicId TEXT, front TEXT, back TEXT, masteryLevel INTEGER DEFAULT 0)''')
            conn.execute('''CREATE TABLE IF NOT EXISTS curriculum_analysis (
                topicId TEXT PRIMARY KEY, subject TEXT, yearLevel INTEGER,
                logicProfile TEXT, commonQuestions TEXT,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)''')
            conn.execute('''CREATE TABLE IF NOT EXISTS question_logs (
                id TEXT PRIMARY KEY, studentName TEXT, topicId TEXT,
                questionText TEXT, userAnswer TEXT, isCorrect INTEGER,
                feedback TEXT, subject TEXT, difficulty TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)''')
            conn.execute('''CREATE TABLE IF NOT EXISTS mock_papers (
                id TEXT PRIMARY KEY, studentName TEXT,
                status TEXT DEFAULT 'ready', data TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)''')
            conn.commit()

        # Seed demo user
        _seed_demo(conn)
        print("EduGenius DB initialised.")
    except Exception as e:
        print(f"DB init error: {e}")
        if DB_TYPE == 'postgres':
            conn.rollback()
    finally:
        conn.close()

def _seed_demo(conn):
    demo = {
        "name": "DemoGenius", "password": "demo123",
        "yearLevel": 9, "activeSubject": "Maths",
        "gems": 500, "totalPoints": 1250, "streak": 7,
        "activeSkinId": "default", "unlockedSkins": ["default"],
        "masteryData": {}, "currentBriefingVault": []
    }
    try:
        if DB_TYPE == 'postgres':
            cur = conn.cursor()
            cur.execute(
                'INSERT INTO profiles (name, data) VALUES (%s, %s) ON CONFLICT (name) DO NOTHING',
                ('DemoGenius', json.dumps(demo))
            )
            conn.commit()
        else:
            conn.execute(
                'INSERT OR IGNORE INTO profiles (name, data) VALUES (?, ?)',
                ('DemoGenius', json.dumps(demo))
            )
            conn.commit()
    except Exception as e:
        print(f"Seed warning: {e}")

# ── Health ────────────────────────────────────────────────────────────────────
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "online", "db": DB_TYPE})

# ── Profiles ──────────────────────────────────────────────────────────────────
@app.route('/api/profile/<name>', methods=['GET'])
def get_profile(name):
    try:
        conn = get_db()
        cur = db_execute(conn, 'SELECT data FROM profiles WHERE name = ?', (name,))
        row = cur.fetchone()
        conn.close()
        return jsonify(json.loads(row['data'])) if row else (jsonify(None), 404)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/profile', methods=['POST'])
def save_profile():
    try:
        data = request.json
        conn = get_db()
        if DB_TYPE == 'postgres':
            db_execute(conn,
                'INSERT INTO profiles (name, data) VALUES (%s, %s) ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data',
                (data['name'], json.dumps(data)))
        else:
            db_execute(conn,
                'INSERT OR REPLACE INTO profiles (name, data) VALUES (?, ?)',
                (data['name'], json.dumps(data)))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Seed endpoint (reset demo user) ──────────────────────────────────────────
@app.route('/api/seed', methods=['POST'])
def seed():
    try:
        conn = get_db()
        demo = {
            "name": "DemoGenius", "password": "demo123",
            "yearLevel": 9, "activeSubject": "Maths",
            "gems": 500, "totalPoints": 1250, "streak": 7,
            "activeSkinId": "default", "unlockedSkins": ["default"],
            "masteryData": {}, "currentBriefingVault": []
        }
        if DB_TYPE == 'postgres':
            db_execute(conn,
                'INSERT INTO profiles (name, data) VALUES (%s, %s) ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data',
                ('DemoGenius', json.dumps(demo)))
        else:
            db_execute(conn,
                'INSERT OR REPLACE INTO profiles (name, data) VALUES (?, ?)',
                ('DemoGenius', json.dumps(demo)))
        conn.commit()
        conn.close()
        return jsonify({"status": "DemoGenius reseeded"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Curriculum ────────────────────────────────────────────────────────────────
@app.route('/api/curriculum/<topic_id>', methods=['GET'])
def get_curriculum(topic_id):
    try:
        conn = get_db()
        cur = db_execute(conn, 'SELECT * FROM curriculum_analysis WHERE topicId = ?', (topic_id,))
        row = cur.fetchone()
        conn.close()
        if row:
            res = row_to_dict(row)
            try: res['logicProfile'] = json.loads(res['logicProfile'])
            except: pass
            try: res['commonQuestions'] = json.loads(res['commonQuestions'])
            except: pass
            return jsonify(res)
        return (jsonify(None), 404)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/curriculum', methods=['POST'])
def save_curriculum():
    try:
        d = request.json
        conn = get_db()
        if DB_TYPE == 'postgres':
            db_execute(conn, '''
                INSERT INTO curriculum_analysis ("topicId", subject, "yearLevel", "logicProfile", "commonQuestions")
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT ("topicId") DO UPDATE SET
                    "logicProfile" = EXCLUDED."logicProfile",
                    "commonQuestions" = EXCLUDED."commonQuestions"
            ''', (d['topicId'], d['subject'], d['yearLevel'],
                  json.dumps(d.get('logicProfile', {})),
                  json.dumps(d.get('commonQuestions', []))))
        else:
            db_execute(conn, '''
                INSERT OR REPLACE INTO curriculum_analysis (topicId, subject, yearLevel, logicProfile, commonQuestions)
                VALUES (?, ?, ?, ?, ?)
            ''', (d['topicId'], d['subject'], d['yearLevel'],
                  json.dumps(d.get('logicProfile', {})),
                  json.dumps(d.get('commonQuestions', []))))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Synthesis ─────────────────────────────────────────────────────────────────
@app.route('/api/synthesis/<student>/<topic_id>', methods=['GET'])
def get_synthesis(student, topic_id):
    try:
        conn = get_db()
        cur = db_execute(conn,
            'SELECT data FROM topic_synthesis WHERE studentName = ? AND topicId = ?',
            (student, topic_id))
        row = cur.fetchone()
        conn.close()
        return jsonify(json.loads(row['data'])) if row else (jsonify(None), 404)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/synthesis', methods=['POST'])
def save_synthesis():
    try:
        d = request.json
        conn = get_db()
        if DB_TYPE == 'postgres':
            db_execute(conn, '''
                INSERT INTO topic_synthesis ("studentName", "topicId", data)
                VALUES (%s, %s, %s)
                ON CONFLICT ("studentName", "topicId") DO UPDATE SET data = EXCLUDED.data
            ''', (d['studentName'], d['topicId'], json.dumps(d['data'])))
        else:
            db_execute(conn,
                'INSERT OR REPLACE INTO topic_synthesis (studentName, topicId, data) VALUES (?, ?, ?)',
                (d['studentName'], d['topicId'], json.dumps(d['data'])))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Logs ──────────────────────────────────────────────────────────────────────
@app.route('/api/logs', methods=['POST'])
def save_log():
    try:
        d = request.json
        conn = get_db()
        db_execute(conn, '''
            INSERT INTO question_logs
            (id, studentName, topicId, questionText, userAnswer, isCorrect, feedback, subject, difficulty)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (d.get('id',''), d.get('studentName',''), d.get('topicId',''),
              d.get('questionText',''), d.get('userAnswer',''),
              1 if d.get('isCorrect') else 0,
              d.get('feedback',''), d.get('subject',''), d.get('difficulty','')))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/logs/<name>', methods=['GET'])
def get_logs(name):
    try:
        conn = get_db()
        cur = db_execute(conn,
            'SELECT * FROM question_logs WHERE studentName = ? ORDER BY timestamp DESC LIMIT 100',
            (name,))
        rows = cur.fetchall()
        conn.close()
        return jsonify(rows_to_list(rows))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Vaults ────────────────────────────────────────────────────────────────────
@app.route('/api/vault/<vault_type>/<student>/all', methods=['GET'])
def get_vault_all(vault_type, student):
    try:
        table = f"{vault_type}_vault"
        conn = get_db()
        cur = db_execute(conn, f'SELECT data FROM {table} WHERE studentName = ?', (student,))
        rows = cur.fetchall()
        conn.close()
        return jsonify([json.loads(r['data']) for r in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/vault/<vault_type>/<student>/<topic_id>', methods=['GET'])
def get_vault(vault_type, student, topic_id):
    try:
        table = f"{vault_type}_vault"
        conn = get_db()
        cur = db_execute(conn,
            f'SELECT data FROM {table} WHERE studentName = ? AND topicId = ?',
            (student, topic_id))
        rows = cur.fetchall()
        conn.close()
        return jsonify([json.loads(r['data']) for r in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/vault/<vault_type>', methods=['POST'])
def save_vault(vault_type):
    try:
        item = request.json
        table = f"{vault_type}_vault"
        conn = get_db()
        if DB_TYPE == 'postgres':
            db_execute(conn,
                f'INSERT INTO {table} (id, "studentName", "topicId", data) VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
                (item['id'], item['studentName'], item['topicId'], json.dumps(item)))
        else:
            db_execute(conn,
                f'INSERT OR REPLACE INTO {table} (id, studentName, topicId, data) VALUES (?, ?, ?, ?)',
                (item['id'], item['studentName'], item['topicId'], json.dumps(item)))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/vault/<vault_type>/<item_id>', methods=['DELETE'])
def delete_vault(vault_type, item_id):
    try:
        table = f"{vault_type}_vault"
        conn = get_db()
        db_execute(conn, f'DELETE FROM {table} WHERE id = ?', (item_id,))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Mock Papers ───────────────────────────────────────────────────────────────
@app.route('/api/mock_papers/<student>', methods=['GET'])
def get_mock_papers(student):
    try:
        conn = get_db()
        cur = db_execute(conn,
            'SELECT data FROM mock_papers WHERE studentName = ? ORDER BY createdAt DESC',
            (student,))
        rows = cur.fetchall()
        conn.close()
        return jsonify([json.loads(r['data']) for r in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/mock_papers', methods=['POST'])
def save_mock_paper():
    try:
        d = request.json
        conn = get_db()
        if DB_TYPE == 'postgres':
            db_execute(conn,
                'INSERT INTO mock_papers (id, "studentName", status, data) VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
                (d['id'], d['studentName'], d.get('status','ready'), json.dumps(d)))
        else:
            db_execute(conn,
                'INSERT OR REPLACE INTO mock_papers (id, studentName, status, data) VALUES (?, ?, ?, ?)',
                (d['id'], d['studentName'], d.get('status','ready'), json.dumps(d)))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Gemini AI Proxy ───────────────────────────────────────────────────────────
def _call_gemini(payload):
    import urllib.request, urllib.error
    key = os.environ.get('GEMINI_API_KEY', '')
    if not key:
        raise Exception('GEMINI_API_KEY not set')
    model = payload.get('model', 'gemini-2.5-flash')
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}'
    body = json.dumps({'contents': payload['contents']}).encode()
    req = urllib.request.Request(url, data=body,
        headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read())
        return data['candidates'][0]['content']['parts'][0]['text']

@app.route('/api/ai/generate', methods=['POST'])
def ai_generate():
    try:
        data = request.json or {}
        prompt = data.get('prompt', '')
        system = data.get('system', '')
        full = ('SYSTEM: ' + system + '\n\nUSER: ' + prompt) if system else prompt
        text = _call_gemini({'contents': [{'parts': [{'text': full}]}]})
        return jsonify({'text': text})
    except Exception as e:
        print(f'AI error: {e}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai/vision', methods=['POST'])
def ai_vision():
    try:
        data = request.json or {}
        text = _call_gemini({
            'contents': [{'parts': [
                {'text': data.get('prompt', '')},
                {'inline_data': {'mime_type': data.get('mimeType','image/jpeg'), 'data': data.get('imageData','')}}
            ]}]
        })
        return jsonify({'text': text})
    except Exception as e:
        print(f'Vision error: {e}')
        return jsonify({'error': str(e)}), 500

# ── Static Question Bank Routes ───────────────────────────────────────────────
@app.route('/api/question/static', methods=['POST'])
def static_question():
    try:
        data = request.json or {}
        q = get_static_question(
            topic_id   = data.get('topicId', ''),
            difficulty = data.get('difficulty', 'Beginner'),
            year       = data.get('yearLevel', 9),
            used_ids   = data.get('usedIds', [])
        )
        return jsonify(q) if q else (jsonify({'error': 'bank_exhausted'}), 404)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/curriculum/static/<topic_id>', methods=['GET'])
def static_curriculum(topic_id):
    try:
        c = get_static_curriculum(topic_id)
        return jsonify(c) if c else (jsonify({'error': 'not_found'}), 404)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bank/stats', methods=['GET'])
def bank_stats():
    try:
        return jsonify(get_bank_stats())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Start ─────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    init_db()
    port = int(os.environ.get("PORT", 5000))
    print(f"EduGenius running on http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
else:
    # Called by gunicorn
    init_db()
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

    # Write the DB file onto the Railway persistent volume when one is mounted
    # (RAILWAY_VOLUME_MOUNT_PATH is set automatically by Railway). Falls back to
    # the working directory for local dev. Without this, the SQLite file lives on
    # the container's ephemeral filesystem and is wiped on every redeploy.
    _DB_DIR = os.environ.get('RAILWAY_VOLUME_MOUNT_PATH', '.')
    _DB_PATH = os.path.join(_DB_DIR, 'edugenius.db')

    def get_db():
        conn = sqlite3.connect(_DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

    print(f"SQLite path: {_DB_PATH}")

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
        _cleanup_default_admin(conn)
        _seed_admin(conn)
        print("EduGenius DB initialised.")
    except Exception as e:
        print(f"DB init error: {e}")
        if DB_TYPE == 'postgres':
            conn.rollback()
    finally:
        conn.close()

def _cleanup_default_admin(conn):
    """Remove the insecure default admin (admin@edugenius.ai / changeme123) that
    an earlier deploy may have seeded. Only deletes it if it still has the public
    default password — never touches a deliberately-configured admin."""
    try:
        row = _get_profile_row(conn, 'admin@edugenius.ai')
        if row and row.get('role') == 'admin' and row.get('password') == 'changeme123':
            db_execute(conn, 'DELETE FROM profiles WHERE name = ?', ('admin@edugenius.ai',))
            conn.commit()
            print("Removed insecure default admin account.")
    except Exception as e:
        print(f"Default admin cleanup warning: {e}")

def _seed_admin(conn):
    """Seed a single admin (question reviewer) account.

    Credentials MUST come from ADMIN_EMAIL / ADMIN_PASSWORD env vars. No default
    is used — a hard-coded password would be public in the repo and let anyone
    into the review panel. If the vars are unset, no admin is seeded.
    Uses INSERT-if-missing so an existing admin is never overwritten.
    """
    email = (os.environ.get('ADMIN_EMAIL') or '').strip().lower()
    password = os.environ.get('ADMIN_PASSWORD') or ''
    if not email or not password:
        print("Admin not seeded — set ADMIN_EMAIL and ADMIN_PASSWORD to enable.")
        return
    admin = {'role': 'admin', 'name': email, 'email': email,
             'password': password, 'displayName': 'Admin'}
    try:
        if DB_TYPE == 'postgres':
            cur = conn.cursor()
            cur.execute('INSERT INTO profiles (name, data) VALUES (%s, %s) ON CONFLICT (name) DO NOTHING',
                        (email, json.dumps(admin)))
            conn.commit()
        else:
            conn.execute('INSERT OR IGNORE INTO profiles (name, data) VALUES (?, ?)',
                         (email, json.dumps(admin)))
            conn.commit()
    except Exception as e:
        print(f"Admin seed warning: {e}")

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

# ── Accounts: Parent (email) + Child (username), Beast-Academy style ─────────
# Reuses the profiles table: each account is one row (name = PK).
#   Parent row: name = email,    data.role = 'parent', data.children = [usernames]
#   Child row:  name = username, data.role = 'child',  data.parentEmail = email
# Passwords are stored in the profile JSON (consistent with existing demo seed).

def _get_profile_row(conn, key):
    cur = db_execute(conn, 'SELECT data FROM profiles WHERE name = ?', (key,))
    row = cur.fetchone()
    return json.loads(row['data']) if row else None

def _save_profile_row(conn, key, data):
    if DB_TYPE == 'postgres':
        db_execute(conn,
            'INSERT INTO profiles (name, data) VALUES (%s, %s) ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data',
            (key, json.dumps(data)))
    else:
        db_execute(conn,
            'INSERT OR REPLACE INTO profiles (name, data) VALUES (?, ?)',
            (key, json.dumps(data)))

@app.route('/api/auth/parent/signup', methods=['POST'])
def parent_signup():
    try:
        d = request.json or {}
        email = (d.get('email') or '').strip().lower()
        password = d.get('password') or ''
        if not email or not password:
            return jsonify({'error': 'email and password required'}), 400
        conn = get_db()
        if _get_profile_row(conn, email):
            conn.close()
            return jsonify({'error': 'account_exists'}), 409
        parent = {
            'role': 'parent',
            'name': email,
            'email': email,
            'password': password,
            'displayName': d.get('displayName', ''),
            'children': [],
        }
        _save_profile_row(conn, email, parent)
        conn.commit(); conn.close()
        parent.pop('password', None)
        return jsonify({'status': 'success', 'profile': parent})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/admin/login', methods=['POST'])
def admin_login():
    """Admin (question reviewer) login — separate from parents."""
    try:
        d = request.json or {}
        email = (d.get('email') or '').strip().lower()
        conn = get_db()
        a = _get_profile_row(conn, email)
        conn.close()
        if not a or a.get('role') != 'admin' or a.get('password') != d.get('password'):
            return jsonify({'error': 'invalid_credentials'}), 401
        a.pop('password', None)
        return jsonify({'status': 'success', 'profile': a})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/parent/login', methods=['POST'])
def parent_login():
    try:
        d = request.json or {}
        email = (d.get('email') or '').strip().lower()
        conn = get_db()
        p = _get_profile_row(conn, email)
        conn.close()
        if not p or p.get('role') != 'parent' or p.get('password') != d.get('password'):
            return jsonify({'error': 'invalid_credentials'}), 401
        p.pop('password', None)
        return jsonify({'status': 'success', 'profile': p})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/child/create', methods=['POST'])
def child_create():
    """Parent creates a child account during onboarding."""
    try:
        d = request.json or {}
        parent_email = (d.get('parentEmail') or '').strip().lower()
        username = (d.get('username') or '').strip()
        password = d.get('password') or ''
        if not parent_email or not username or not password:
            return jsonify({'error': 'parentEmail, username and password required'}), 400
        conn = get_db()
        parent = _get_profile_row(conn, parent_email)
        if not parent or parent.get('role') != 'parent':
            conn.close()
            return jsonify({'error': 'parent_not_found'}), 404
        if _get_profile_row(conn, username):
            conn.close()
            return jsonify({'error': 'username_taken'}), 409

        child = {
            'role': 'child',
            'name': username,
            'password': password,
            'parentEmail': parent_email,
            'displayName': d.get('displayName', username),
            'ageBand': d.get('ageBand', ''),
            'targetExam': d.get('targetExam', ''),
            'yearLevel': d.get('yearLevel', 7),
            'reports': d.get('reports', {}),
            'aiAnalysis': d.get('aiAnalysis', ''),
            'recommendedLevel': d.get('recommendedLevel', ''),
            # standard learner fields
            'experience': 0, 'totalPoints': 0, 'gems': 100, 'streak': 1,
            'rank': 'Novice Apprentice',
            'activeSkinId': 'skin-og', 'unlockedSkins': ['skin-og'],
            'badges': [], 'dailyMissions': [], 'masteryData': {},
            'createdAt': d.get('createdAt', ''),
        }
        _save_profile_row(conn, username, child)
        if username not in parent.get('children', []):
            parent.setdefault('children', []).append(username)
            _save_profile_row(conn, parent_email, parent)
        conn.commit(); conn.close()
        child.pop('password', None)
        return jsonify({'status': 'success', 'profile': child})
    except Exception as e:
        print(f'Child create error: {e}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/child/login', methods=['POST'])
def child_login():
    try:
        d = request.json or {}
        username = (d.get('username') or '').strip()
        conn = get_db()
        c = _get_profile_row(conn, username)
        conn.close()
        if not c or c.get('role') != 'child' or c.get('password') != d.get('password'):
            return jsonify({'error': 'invalid_credentials'}), 401
        c.pop('password', None)
        return jsonify({'status': 'success', 'profile': c})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/children/<parent_email>', methods=['GET'])
def list_children(parent_email):
    """All child profiles for a parent (passwords stripped)."""
    try:
        parent_email = parent_email.strip().lower()
        conn = get_db()
        parent = _get_profile_row(conn, parent_email)
        if not parent or parent.get('role') != 'parent':
            conn.close()
            return jsonify([])
        kids = []
        for uname in parent.get('children', []):
            c = _get_profile_row(conn, uname)
            if c:
                c.pop('password', None)
                kids.append(c)
        conn.close()
        return jsonify(kids)
    except Exception as e:
        print(f'List children error: {e}')
        return jsonify([])

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

@app.route('/', methods=['GET'])
def root():
    return jsonify({"service": "EduGenius API", "status": "online"})


# ── Diagnostic Results ───────────────────────────────────────────────────────
# Add these routes to server.py after the existing /api/logs routes
# These store per-question diagnostic results mapped to skill nodes

@app.route('/api/diagnostic/save', methods=['POST'])
def save_diagnostic_result():
    """Save a single diagnostic answer with skill node mapping."""
    try:
        d = request.json or {}
        conn = get_db()

        # Create table if not exists
        if DB_TYPE == 'postgres':
            db_execute(conn, '''
                CREATE TABLE IF NOT EXISTS diagnostic_results (
                    id TEXT PRIMARY KEY,
                    "studentName" TEXT NOT NULL,
                    "sessionId" TEXT NOT NULL,
                    "questionId" TEXT NOT NULL,
                    "skillNode" TEXT NOT NULL,
                    "skillLevel" INTEGER NOT NULL,
                    section TEXT NOT NULL,
                    "isCorrect" BOOLEAN NOT NULL,
                    "wasSkipped" BOOLEAN DEFAULT FALSE,
                    "studentAnswer" TEXT,
                    "correctAnswer" TEXT,
                    "timeTakenSecs" INTEGER,
                    evidence TEXT,
                    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
        else:
            db_execute(conn, '''
                CREATE TABLE IF NOT EXISTS diagnostic_results (
                    id TEXT PRIMARY KEY,
                    studentName TEXT NOT NULL,
                    sessionId TEXT NOT NULL,
                    questionId TEXT NOT NULL,
                    skillNode TEXT NOT NULL,
                    skillLevel INTEGER NOT NULL,
                    section TEXT NOT NULL,
                    isCorrect INTEGER NOT NULL,
                    wasSkipped INTEGER DEFAULT 0,
                    studentAnswer TEXT,
                    correctAnswer TEXT,
                    timeTakenSecs INTEGER,
                    evidence TEXT,
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')

        conn.commit()

        # Save the result
        import uuid
        result_id = d.get('id', str(uuid.uuid4()))

        if DB_TYPE == 'postgres':
            db_execute(conn, '''
                INSERT INTO diagnostic_results
                (id, "studentName", "sessionId", "questionId", "skillNode",
                 "skillLevel", section, "isCorrect", "wasSkipped",
                 "studentAnswer", "correctAnswer", "timeTakenSecs", evidence)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO NOTHING
            ''', (
                result_id, d['studentName'], d['sessionId'], d['questionId'],
                d['skillNode'], d['skillLevel'], d['section'],
                d['isCorrect'], d.get('wasSkipped', False),
                d.get('studentAnswer', ''), d.get('correctAnswer', ''),
                d.get('timeTakenSecs', 0), d.get('evidence', '')
            ))
        else:
            db_execute(conn, '''
                INSERT OR IGNORE INTO diagnostic_results
                (id, studentName, sessionId, questionId, skillNode,
                 skillLevel, section, isCorrect, wasSkipped,
                 studentAnswer, correctAnswer, timeTakenSecs, evidence)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''', (
                result_id, d['studentName'], d['sessionId'], d['questionId'],
                d['skillNode'], d['skillLevel'], d['section'],
                1 if d['isCorrect'] else 0,
                1 if d.get('wasSkipped') else 0,
                d.get('studentAnswer', ''), d.get('correctAnswer', ''),
                d.get('timeTakenSecs', 0), d.get('evidence', '')
            ))

        conn.commit()
        conn.close()
        return jsonify({"status": "saved", "id": result_id})
    except Exception as e:
        print(f"Diagnostic save error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/diagnostic/results/<student_name>', methods=['GET'])
def get_diagnostic_results(student_name):
    """Get all diagnostic results for a student — used to build the skill map."""
    try:
        conn = get_db()

        # Ensure table exists
        if DB_TYPE == 'postgres':
            db_execute(conn, '''
                CREATE TABLE IF NOT EXISTS diagnostic_results (
                    id TEXT PRIMARY KEY,
                    "studentName" TEXT NOT NULL,
                    "sessionId" TEXT NOT NULL,
                    "questionId" TEXT NOT NULL,
                    "skillNode" TEXT NOT NULL,
                    "skillLevel" INTEGER NOT NULL,
                    section TEXT NOT NULL,
                    "isCorrect" BOOLEAN NOT NULL,
                    "wasSkipped" BOOLEAN DEFAULT FALSE,
                    "studentAnswer" TEXT,
                    "correctAnswer" TEXT,
                    "timeTakenSecs" INTEGER,
                    evidence TEXT,
                    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
        else:
            db_execute(conn, '''
                CREATE TABLE IF NOT EXISTS diagnostic_results (
                    id TEXT PRIMARY KEY,
                    studentName TEXT NOT NULL,
                    sessionId TEXT NOT NULL,
                    questionId TEXT NOT NULL,
                    skillNode TEXT NOT NULL,
                    skillLevel INTEGER NOT NULL,
                    section TEXT NOT NULL,
                    isCorrect INTEGER NOT NULL,
                    wasSkipped INTEGER DEFAULT 0,
                    studentAnswer TEXT,
                    correctAnswer TEXT,
                    timeTakenSecs INTEGER,
                    evidence TEXT,
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
        conn.commit()

        cur = db_execute(conn,
            'SELECT * FROM diagnostic_results WHERE studentName = ? ORDER BY createdAt DESC',
            (student_name,))
        rows = cur.fetchall()
        conn.close()
        return jsonify(rows_to_list(rows))
    except Exception as e:
        print(f"Diagnostic get error: {e}")
        return jsonify([])


@app.route('/api/diagnostic/session/<student_name>/<session_id>', methods=['GET'])
def get_diagnostic_session(student_name, session_id):
    """Get results for one specific diagnostic session."""
    try:
        conn = get_db()
        cur = db_execute(conn,
            'SELECT * FROM diagnostic_results WHERE studentName = ? AND sessionId = ? ORDER BY createdAt ASC',
            (student_name, session_id))
        rows = cur.fetchall()
        conn.close()
        return jsonify(rows_to_list(rows))
    except Exception as e:
        return jsonify([])


@app.route('/api/diagnostic/skillmap/<student_name>', methods=['GET'])
def get_skill_map(student_name):
    """
    Compute skill map from all diagnostic results for a student.
    Returns per-node: confidence, source, evidence, last_tested.
    Only uses confirmed diagnostic evidence — never guesses.
    """
    try:
        conn = get_db()
        try:
            cur = db_execute(conn,
                'SELECT * FROM diagnostic_results WHERE studentName = ? ORDER BY createdAt DESC',
                (student_name,))
            rows = rows_to_list(cur.fetchall())
        except:
            rows = []
        conn.close()

        if not rows:
            return jsonify({
                "studentName": student_name,
                "nodes": {},
                "summary": {
                    "totalTested": 0,
                    "confirmed_strong": 0,
                    "confirmed_gaps": 0,
                    "message": "No diagnostic results yet. Take the diagnostic test to build your skill map."
                }
            })

        # Group by skill node — take most recent result per node
        node_results = {}
        for row in rows:
            node = row.get('skillNode') or row.get('skill_node') or row.get('skillnode', '')
            if not node:
                continue
            if node not in node_results:
                node_results[node] = []
            node_results[node].append(row)

        # Compute confidence per node from all attempts.
        #
        # Design principles:
        #   1. Confidence reflects the *observed accuracy* directly. A single
        #      correct answer is real evidence of competence and must be able to
        #      reach the "strong" band — it should never be capped below it by a
        #      sample-size penalty. (The previous formula blended every node
        #      toward 50, which made "confirmed strong" unreachable on the common
        #      single-attempt node and contradicted the product's core promise.)
        #   2. Sample size is reported via the separate `reliability` field, not
        #      by distorting the confidence number.
        #   3. "We don't know yet" is an explicit state (`status: 'untested'`),
        #      not a 50% score that masquerades as a measurement. Here every node
        #      present has at least one attempt or a skip, so it is never untested,
        #      but the band labelling keeps the distinction honest.
        STRONG_BAND = 70
        GAP_BAND = 45

        skill_map = {}
        for node_id, results in node_results.items():
            correct = sum(1 for r in results if r.get('isCorrect') or r.get('is_correct'))
            total = len(results)
            skipped = sum(1 for r in results if r.get('wasSkipped') or r.get('was_skipped'))
            attempted = total - skipped

            if attempted == 0:
                # Only skipped — confirms the student did not attempt it.
                conf = 15
                status = 'gap'
                reliability = 'low'
                evidence = 'Skipped in diagnostic — not yet attempted'
            else:
                accuracy = correct / attempted
                # Confidence maps accuracy onto a 20–95 band so a perfect score
                # reads as "strong" and a zero score reads as a "gap", without
                # ever claiming absolute certainty.
                conf = int(round(20 + accuracy * 75))
                conf = max(10, min(95, conf))

                # Reliability is about how much evidence backs the score.
                reliability = 'high' if attempted >= 3 else 'medium' if attempted >= 2 else 'low'

                if accuracy >= 0.8:
                    status = 'strong'
                    evidence = f'Correct {correct}/{attempted} in diagnostic — strong'
                elif accuracy >= 0.5:
                    status = 'developing'
                    evidence = f'Correct {correct}/{attempted} — developing, more practice needed'
                else:
                    status = 'gap'
                    evidence = f'Correct {correct}/{attempted} — gap confirmed, targeted practice needed'

                if reliability == 'low':
                    evidence += ' (single question — confirm with more practice)'

            skill_map[node_id] = {
                'confidence': conf,
                'status': status,
                'reliability': reliability,
                'source': 'diagnostic',
                'evidence': evidence,
                'correct': correct,
                'attempted': attempted,
                'total': total,
                'level': results[0].get('skillLevel') or results[0].get('skill_level', 0),
                'section': results[0].get('section', ''),
                'lastTested': results[0].get('createdAt') or results[0].get('created_at', ''),
            }

        confirmed_strong = sum(1 for v in skill_map.values() if v['confidence'] >= STRONG_BAND)
        confirmed_gaps = sum(1 for v in skill_map.values() if v['confidence'] < GAP_BAND)

        return jsonify({
            "studentName": student_name,
            "nodes": skill_map,
            "summary": {
                "totalTested": len(skill_map),
                "confirmed_strong": confirmed_strong,
                "confirmed_gaps": confirmed_gaps,
                "message": f"{len(skill_map)} nodes tested. {confirmed_strong} strong, {confirmed_gaps} gaps identified."
            }
        })
    except Exception as e:
        print(f"Skill map error: {e}")
        return jsonify({"error": str(e)}), 500

# ── Diagnostic Question Review Queue ─────────────────────────────────────────
# Admin workflow: draft questions land here, get reviewed/edited/approved,
# and only approved ones are served to the live diagnostic.

_REVIEW_SEED = _DATA_DIR / 'diagnostic_review.json'


def _ensure_review_table(conn):
    if DB_TYPE == 'postgres':
        db_execute(conn, '''
            CREATE TABLE IF NOT EXISTS diagnostic_questions (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                reviewed BOOLEAN DEFAULT FALSE,
                approved BOOLEAN DEFAULT FALSE,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )''')
    else:
        db_execute(conn, '''
            CREATE TABLE IF NOT EXISTS diagnostic_questions (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                reviewed INTEGER DEFAULT 0,
                approved INTEGER DEFAULT 0,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )''')
    conn.commit()


def _seed_review_questions(conn):
    """Load draft questions from diagnostic_review.json into the table.

    Incremental and idempotent: INSERT OR IGNORE / ON CONFLICT DO NOTHING means
    existing rows (and their review/approval progress) are never overwritten,
    while any newly-added questions in the JSON get inserted on the next call.
    """
    if not _REVIEW_SEED.exists():
        return

    payload = json.loads(_REVIEW_SEED.read_text(encoding='utf-8'))
    questions = payload.get('questions', {})
    for qid, q in questions.items():
        reviewed = bool(q.get('reviewed'))
        approved = bool(q.get('approved'))
        if DB_TYPE == 'postgres':
            db_execute(conn,
                'INSERT INTO diagnostic_questions (id, data, reviewed, approved) VALUES (%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING',
                (qid, json.dumps(q), reviewed, approved))
        else:
            db_execute(conn,
                'INSERT OR IGNORE INTO diagnostic_questions (id, data, reviewed, approved) VALUES (?,?,?,?)',
                (qid, json.dumps(q), 1 if reviewed else 0, 1 if approved else 0))
    conn.commit()


def _review_row_to_question(row):
    d = row_to_dict(row)
    try:
        q = json.loads(d['data'])
    except Exception:
        q = {}
    q['id'] = d['id']
    q['reviewed'] = bool(d['reviewed'])
    q['approved'] = bool(d['approved'])
    return q


@app.route('/api/diagnostic/review/all', methods=['GET'])
def review_all():
    """List every draft question with its review/approval status."""
    try:
        conn = get_db()
        _ensure_review_table(conn)
        _seed_review_questions(conn)
        cur = db_execute(conn, 'SELECT * FROM diagnostic_questions ORDER BY id ASC')
        rows = cur.fetchall()
        conn.close()
        questions = [_review_row_to_question(r) for r in rows]
        return jsonify({
            'total': len(questions),
            'reviewed_count': sum(1 for q in questions if q['reviewed']),
            'approved_count': sum(1 for q in questions if q['approved']),
            'questions': questions,
        })
    except Exception as e:
        print(f'Review list error: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/api/diagnostic/review/update', methods=['POST'])
def review_update():
    """Update one question: edited fields and/or reviewed/approved flags."""
    try:
        d = request.json or {}
        qid = d.get('id')
        if not qid:
            return jsonify({'error': 'id required'}), 400
        conn = get_db()
        _ensure_review_table(conn)

        cur = db_execute(conn, 'SELECT data FROM diagnostic_questions WHERE id = ?', (qid,))
        row = cur.fetchone()
        if not row:
            conn.close()
            return jsonify({'error': 'not_found'}), 404

        existing = json.loads(row_to_dict(row)['data'])
        # Merge any edited question fields (text, correctAnswer, options, etc.)
        edits = d.get('question') or {}
        existing.update(edits)
        reviewed = bool(d.get('reviewed', existing.get('reviewed', False)))
        approved = bool(d.get('approved', existing.get('approved', False)))
        # Approval implies review.
        if approved:
            reviewed = True
        existing['reviewed'] = reviewed
        existing['approved'] = approved

        if DB_TYPE == 'postgres':
            db_execute(conn,
                'UPDATE diagnostic_questions SET data=%s, reviewed=%s, approved=%s, "updatedAt"=CURRENT_TIMESTAMP WHERE id=%s',
                (json.dumps(existing), reviewed, approved, qid))
        else:
            db_execute(conn,
                'UPDATE diagnostic_questions SET data=?, reviewed=?, approved=?, updatedAt=CURRENT_TIMESTAMP WHERE id=?',
                (json.dumps(existing), 1 if reviewed else 0, 1 if approved else 0, qid))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success', 'id': qid, 'reviewed': reviewed, 'approved': approved})
    except Exception as e:
        print(f'Review update error: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/api/diagnostic/questions/approved', methods=['GET'])
def approved_questions():
    """Approved questions only — this is what the live diagnostic consumes."""
    try:
        conn = get_db()
        _ensure_review_table(conn)
        _seed_review_questions(conn)
        if DB_TYPE == 'postgres':
            cur = db_execute(conn, 'SELECT * FROM diagnostic_questions WHERE approved = TRUE ORDER BY id ASC')
        else:
            cur = db_execute(conn, 'SELECT * FROM diagnostic_questions WHERE approved = 1 ORDER BY id ASC')
        rows = cur.fetchall()
        conn.close()
        questions = {q['id']: q for q in (_review_row_to_question(r) for r in rows)}
        return jsonify({'total': len(questions), 'questions': questions})
    except Exception as e:
        print(f'Approved questions error: {e}')
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
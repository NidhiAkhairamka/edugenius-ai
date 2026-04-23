from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import json
import os

app = Flask(__name__)

# ── CORS — allow ALL origins (required for Android app on local network) ──────
CORS(app, resources={r"/api/*": {"origins": "*"}})

DB_PATH = 'edugenius.db'

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. User Profiles
    cursor.execute('CREATE TABLE IF NOT EXISTS profiles (name TEXT PRIMARY KEY, data TEXT NOT NULL)')

    # 2. Vaults (Raw Scans)
    cursor.execute('CREATE TABLE IF NOT EXISTS agent_eye_vault (id TEXT PRIMARY KEY, studentName TEXT, topicId TEXT, data TEXT NOT NULL)')
    cursor.execute('CREATE TABLE IF NOT EXISTS briefing_vault (id TEXT PRIMARY KEY, studentName TEXT, topicId TEXT, data TEXT NOT NULL)')

    # 3. Topic Synthesis
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS topic_synthesis (
            studentName TEXT,
            topicId TEXT,
            data TEXT NOT NULL,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (studentName, topicId)
        )
    ''')

    # 4. Flashcards
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS flashcards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            studentName TEXT,
            topicId TEXT,
            front TEXT,
            back TEXT,
            masteryLevel INTEGER DEFAULT 0
        )
    ''')

    # 5. Curriculum Grounding
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS curriculum_analysis (
            topicId TEXT PRIMARY KEY,
            subject TEXT,
            yearLevel INTEGER,
            logicProfile TEXT,
            commonQuestions TEXT,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 6. Question Logs
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS question_logs (
            id TEXT PRIMARY KEY,
            studentName TEXT,
            topicId TEXT,
            questionText TEXT,
            userAnswer TEXT,
            isCorrect INTEGER,
            feedback TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 7. Mock Exam Papers
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS mock_papers (
            id TEXT PRIMARY KEY,
            studentName TEXT,
            status TEXT DEFAULT 'ready',
            data TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 8. Quality Logs
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS quality_logs (
            id TEXT PRIMARY KEY,
            studentName TEXT,
            topicId TEXT,
            topicName TEXT,
            validationPassed INTEGER,
            topicMatchScore REAL,
            attempts INTEGER,
            usedFallback INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # ── Safe migrations — add columns if they don't exist ────────────────────
    existing_cols = [row[1] for row in cursor.execute('PRAGMA table_info(question_logs)').fetchall()]
    if 'subject' not in existing_cols:
        cursor.execute('ALTER TABLE question_logs ADD COLUMN subject TEXT')
        print("Migration: added 'subject' column to question_logs")
    if 'difficulty' not in existing_cols:
        cursor.execute('ALTER TABLE question_logs ADD COLUMN difficulty TEXT')
        print("Migration: added 'difficulty' column to question_logs")

    conn.commit()
    conn.close()
    print("EduGenius DB initialised successfully.")

# ── Health ────────────────────────────────────────────────────────────────────
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "online",
        "tables": ["profiles", "vaults", "synthesis", "flashcards", "curriculum", "logs", "mock_papers"]
    })

# ── Profiles ──────────────────────────────────────────────────────────────────
@app.route('/api/profile/<n>', methods=['GET'])
def get_profile(n):
    try:
        conn = get_db_connection()
        profile = conn.execute('SELECT data FROM profiles WHERE name = ?', (n,)).fetchone()
        conn.close()
        return jsonify(json.loads(profile['data'])) if profile else (jsonify(None), 404)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/profile', methods=['POST'])
def save_profile():
    try:
        data = request.json
        conn = get_db_connection()
        conn.execute('INSERT OR REPLACE INTO profiles (name, data) VALUES (?, ?)',
                     (data['name'], json.dumps(data)))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Curriculum ────────────────────────────────────────────────────────────────
@app.route('/api/curriculum/<topic_id>', methods=['GET'])
def get_curriculum(topic_id):
    try:
        conn = get_db_connection()
        row = conn.execute('SELECT * FROM curriculum_analysis WHERE topicId = ?', (topic_id,)).fetchone()
        conn.close()
        if row:
            res = dict(row)
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
        conn = get_db_connection()
        conn.execute('''
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
@app.route('/api/synthesis/<student_name>/<topic_id>', methods=['GET'])
def get_synthesis(student_name, topic_id):
    try:
        conn = get_db_connection()
        row = conn.execute('SELECT data FROM topic_synthesis WHERE studentName = ? AND topicId = ?',
                           (student_name, topic_id)).fetchone()
        conn.close()
        return jsonify(json.loads(row['data'])) if row else (jsonify(None), 404)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/synthesis', methods=['POST'])
def save_synthesis():
    try:
        d = request.json
        conn = get_db_connection()
        conn.execute('INSERT OR REPLACE INTO topic_synthesis (studentName, topicId, data) VALUES (?, ?, ?)',
                     (d['studentName'], d['topicId'], json.dumps(d['data'])))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Flashcards ────────────────────────────────────────────────────────────────
@app.route('/api/flashcards/<student_name>/<topic_id>', methods=['GET'])
def get_flashcards(student_name, topic_id):
    try:
        conn = get_db_connection()
        rows = conn.execute('SELECT * FROM flashcards WHERE studentName = ? AND topicId = ?',
                            (student_name, topic_id)).fetchall()
        conn.close()
        return jsonify([dict(row) for row in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/flashcards', methods=['POST'])
def save_flashcards():
    try:
        d = request.json
        conn = get_db_connection()
        conn.execute('DELETE FROM flashcards WHERE studentName = ? AND topicId = ?',
                     (d['studentName'], d['topicId']))
        for card in d.get('cards', []):
            conn.execute('INSERT INTO flashcards (studentName, topicId, front, back) VALUES (?, ?, ?, ?)',
                         (d['studentName'], d['topicId'], card['front'], card['back']))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Question Logs ─────────────────────────────────────────────────────────────
@app.route('/api/logs', methods=['POST'])
def save_log():
    try:
        d = request.json
        conn = get_db_connection()
        conn.execute('''
            INSERT OR REPLACE INTO question_logs
            (id, studentName, topicId, questionText, userAnswer, isCorrect, feedback, subject, difficulty)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (d.get('id', ''), d.get('studentName', ''), d.get('topicId', ''),
              d.get('questionText', ''), d.get('userAnswer', ''),
              1 if d.get('isCorrect') else 0,
              d.get('feedback', ''),
              d.get('subject', ''),
              d.get('difficulty', '')))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/logs/<n>', methods=['GET'])
def get_logs(n):
    try:
        conn = get_db_connection()
        rows = conn.execute(
            'SELECT * FROM question_logs WHERE studentName = ? ORDER BY timestamp DESC LIMIT 100',
            (n,)).fetchall()
        conn.close()
        return jsonify([dict(row) for row in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Vaults ────────────────────────────────────────────────────────────────────
@app.route('/api/vault/<vault_type>/all', methods=['GET'])
def get_all_vault_items_no_student(vault_type):
    return jsonify([])

@app.route('/api/vault/<vault_type>/<student_name>/all', methods=['GET'])
def get_all_vault_items(vault_type, student_name):
    try:
        table = f"{vault_type}_vault"
        conn = get_db_connection()
        rows = conn.execute(f'SELECT data FROM {table} WHERE studentName = ?', (student_name,)).fetchall()
        conn.close()
        return jsonify([json.loads(row['data']) for row in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/vault/<vault_type>/<student_name>/<topic_id>', methods=['GET'])
def get_vault_items(vault_type, student_name, topic_id):
    try:
        table = f"{vault_type}_vault"
        conn = get_db_connection()
        rows = conn.execute(
            f'SELECT data FROM {table} WHERE studentName = ? AND topicId = ?',
            (student_name, topic_id)).fetchall()
        conn.close()
        return jsonify([json.loads(row['data']) for row in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/vault/<vault_type>', methods=['POST'])
def save_vault_item(vault_type):
    try:
        item = request.json
        table = f"{vault_type}_vault"
        conn = get_db_connection()
        conn.execute(
            f'INSERT OR REPLACE INTO {table} (id, studentName, topicId, data) VALUES (?, ?, ?, ?)',
            (item['id'], item['studentName'], item['topicId'], json.dumps(item)))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/vault/<vault_type>/<item_id>', methods=['DELETE'])
def delete_vault_item(vault_type, item_id):
    try:
        table = f"{vault_type}_vault"
        conn = get_db_connection()
        conn.execute(f'DELETE FROM {table} WHERE id = ?', (item_id,))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Mock Papers ───────────────────────────────────────────────────────────────
@app.route('/api/mock_papers/<student_name>', methods=['GET'])
def get_mock_papers(student_name):
    try:
        conn = get_db_connection()
        rows = conn.execute(
            'SELECT data FROM mock_papers WHERE studentName = ? ORDER BY createdAt DESC',
            (student_name,)).fetchall()
        conn.close()
        return jsonify([json.loads(row['data']) for row in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/mock_papers', methods=['POST'])
def save_mock_paper():
    try:
        d = request.json
        conn = get_db_connection()
        conn.execute(
            'INSERT OR REPLACE INTO mock_papers (id, studentName, status, data) VALUES (?, ?, ?, ?)',
            (d['id'], d['studentName'], d.get('status', 'ready'), json.dumps(d)))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─────────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    init_db()
    port = int(os.environ.get("PORT", 5000))
    print(f"EduGenius server running on http://0.0.0.0:{port}")
    print(f"From your phone, use: http://YOUR_PC_IP:{port}/api")
    app.run(host='0.0.0.0', port=port, debug=False)
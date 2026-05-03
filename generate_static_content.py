"""
EduGenius Static Content Generator
====================================
Run ONCE on your PC. Generates all curriculum content and question banks
for Years 5-10, saves to JSON files. Students never wait for AI again.

Usage:
  python generate_static_content.py

Output:
  data/curriculum.json          — briefing content for all 58 topics
  data/questions/               — question bank per topic
    m-y9-trig.json
    m-y9-equations.json
    ... (one file per topic)

Time: ~45 minutes
Cost: ~$0.13 one-time

After running:
  1. Commit the data/ folder to your repo
  2. Update LearningArena to read from curriculum.json first
  3. Update fetchQuestion to draw from question bank first
"""

import json, os, time, logging, random
from datetime import datetime
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

API_KEY    = os.environ.get('GEMINI_API_KEY') or 'AIzaSyCBDFr38KZNmZdyG1wvvGAwCLrSkzf9o7w'
MODEL      = 'gemini-2.5-flash'
DATA_DIR   = Path(__file__).parent / 'data'
Q_DIR      = DATA_DIR / 'questions'
LOG_FILE   = Path(__file__).parent / 'generate_log.txt'

QUESTIONS_PER_DIFFICULTY = 10
DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced']
API_DELAY  = 1.5   # seconds between calls — respects rate limits

# ── All topics (mirrors constants.ts exactly) ─────────────────────────────────

TOPICS = [
    # YEAR 5 MATHS
    {'id':'m-y5-place-value', 'name':'Place Value Mastery',    'subject':'Maths',   'year':5, 'desc':'Numbers up to 1,000,000, rounding, and negative numbers.'},
    {'id':'m-y5-add-sub',     'name':'Addition & Subtraction', 'subject':'Maths',   'year':5, 'desc':'Formal written methods for large numbers and mental strategies.'},
    {'id':'m-y5-mult-div',    'name':'Multiplication & Division','subject':'Maths', 'year':5, 'desc':'Factors, primes, square/cube numbers, and multi-digit multiplication.'},
    {'id':'m-y5-fractions',   'name':'Fractions & Decimals',   'subject':'Maths',   'year':5, 'desc':'Comparing, ordering, and adding fractions with different denominators.'},
    {'id':'m-y5-perc',        'name':'Percentages',            'subject':'Maths',   'year':5, 'desc':'Understanding percentages as a fraction of 100.'},
    {'id':'m-y5-measure',     'name':'Measurement & Area',     'subject':'Maths',   'year':5, 'desc':'Converting units and calculating area/perimeter of composite shapes.'},
    {'id':'m-y5-geometry',    'name':'Properties of Shapes',   'subject':'Maths',   'year':5, 'desc':'Identifying 3D shapes, measuring angles, and degrees.'},
    {'id':'m-y5-pos-dir',     'name':'Position & Direction',   'subject':'Maths',   'year':5, 'desc':'Reflection and translation of shapes on a coordinate grid.'},
    {'id':'m-y5-stats',       'name':'Statistics & Graphs',    'subject':'Maths',   'year':5, 'desc':'Solving comparison and sum problems using line graphs and tables.'},
    # YEAR 5 SCIENCE
    {'id':'s-y5-life-cycles',      'name':'Life Cycles',            'subject':'Science', 'year':5, 'desc':'Comparing life cycles of mammals, amphibians, insects, and birds.'},
    {'id':'s-y5-humans',           'name':'Human Development',      'subject':'Science', 'year':5, 'desc':'Describing the changes as humans develop to old age.'},
    {'id':'s-y5-materials-prop',   'name':'Properties of Materials','subject':'Science', 'year':5, 'desc':'Hardness, solubility, conductivity, and response to magnets.'},
    {'id':'s-y5-materials-change', 'name':'Material Changes',       'subject':'Science', 'year':5, 'desc':'Dissolving, mixing, and reversible vs irreversible changes.'},
    {'id':'s-y5-earth-space',      'name':'Earth & Space',          'subject':'Science', 'year':5, 'desc':'Movement of the Earth and other planets relative to the Sun.'},
    {'id':'s-y5-forces',           'name':'Forces & Gravity',       'subject':'Science', 'year':5, 'desc':'Exploring gravity, air resistance, water resistance, and friction.'},
    # YEAR 6 MATHS
    {'id':'m-y6-fractions',    'name':'Fractions & Decimals',  'subject':'Maths',   'year':6, 'desc':'Mastering equivalence, addition, and subtraction of fractions and decimals.'},
    {'id':'m-y6-algebra-intro','name':'Introductory Algebra',  'subject':'Maths',   'year':6, 'desc':'Using simple formulae and expressing missing number problems algebraically.'},
    {'id':'m-y6-geometry',     'name':'Angles & Shapes',       'subject':'Maths',   'year':6, 'desc':'Calculating angles in triangles, quadrilaterals, and regular polygons.'},
    {'id':'m-y6-measurement',  'name':'Area & Perimeter',      'subject':'Maths',   'year':6, 'desc':'Calculating the area of parallelograms and triangles; volume of cubes.'},
    # YEAR 6 SCIENCE
    {'id':'s-y6-electricity',  'name':'Electricity & Circuits','subject':'Science', 'year':6, 'desc':'Understanding brightness of lamps and volume of buzzers in series circuits.'},
    {'id':'s-y6-light',        'name':'Light & Shadows',       'subject':'Science', 'year':6, 'desc':'How light travels in straight lines and how we see objects through reflection.'},
    {'id':'s-y6-living-things','name':'Living Things',         'subject':'Science', 'year':6, 'desc':'Classification of animals and plants based on specific characteristics.'},
    {'id':'s-y6-evolution',    'name':'Evolution & Inheritance','subject':'Science','year':6, 'desc':'Recognising that living things change over time and offspring vary from parents.'},
    # YEAR 7 MATHS
    {'id':'m-y7-directed-numbers','name':'Directed Numbers',   'subject':'Maths',   'year':7, 'desc':'Operations with negative numbers in contexts like temperature and debt.'},
    {'id':'m-y7-sequences',       'name':'Algebraic Sequences','subject':'Maths',   'year':7, 'desc':'Finding the nth term and describing patterns in number sequences.'},
    {'id':'m-y7-fractions-calc',  'name':'Fractional Thinking','subject':'Maths',   'year':7, 'desc':'Multiplying and dividing fractions and working with mixed numbers.'},
    {'id':'m-y7-prob-basics',     'name':'Probability Basics', 'subject':'Maths',   'year':7, 'desc':'Using the 0-1 probability scale and calculating simple theoretical probabilities.'},
    # YEAR 7 SCIENCE
    {'id':'s-y7-cells',    'name':'Cells & Microscopes','subject':'Science', 'year':7, 'desc':'Structure of plant and animal cells and how to use a light microscope.'},
    {'id':'s-y7-particles','name':'Particles & Atoms',  'subject':'Science', 'year':7, 'desc':'The particle model of solids, liquids, and gases; basic atomic structure.'},
    {'id':'s-y7-forces',   'name':'Forces & Motion',    'subject':'Science', 'year':7, 'desc':'Balanced and unbalanced forces, friction, and calculating speed.'},
    {'id':'s-y7-sound',    'name':'Sound & Hearing',    'subject':'Science', 'year':7, 'desc':'How sound waves travel through mediums and how the human ear works.'},
    # YEAR 8 MATHS
    {'id':'m-y8-ratio',        'name':'Ratio & Proportion',  'subject':'Maths',   'year':8, 'desc':'Sharing amounts in a ratio and solving direct proportion problems.'},
    {'id':'m-y8-linear-graphs','name':'Linear Graphs',       'subject':'Maths',   'year':8, 'desc':'Plotting y = mx + c and understanding gradients and intercepts.'},
    {'id':'m-y8-statistics',   'name':'Statistical Diagrams','subject':'Maths',   'year':8, 'desc':'Interpreting pie charts, frequency tables, and grouped data.'},
    {'id':'m-y8-3d-geometry',  'name':'3D Geometry',         'subject':'Maths',   'year':8, 'desc':'Surface area and volume of prisms, cylinders, and complex shapes.'},
    # YEAR 8 SCIENCE
    {'id':'s-y8-nutrition',       'name':'Nutrition & Digestion','subject':'Science','year':8, 'desc':'The components of a healthy diet and the stages of the digestive system.'},
    {'id':'s-y8-periodic-table',  'name':'The Periodic Table',  'subject':'Science','year':8, 'desc':'Trends in Group 1, Group 7, and the history of Mendeleev\'s table.'},
    {'id':'s-y8-energy-transfers','name':'Energy Transfers',    'subject':'Science','year':8, 'desc':'Conduction, convection, radiation, and efficiency of energy use.'},
    {'id':'s-y8-space',           'name':'Space Physics',       'subject':'Science','year':8, 'desc':'Our solar system, gravity, orbits, and the lifecycle of stars.'},
    # YEAR 9 MATHS
    {'id':'m-y9-pythagoras',   'name':'Pythagoras Theorem',  'subject':'Maths',   'year':9, 'desc':'Using a2 + b2 = c2 to find missing sides in right-angled triangles.'},
    {'id':'m-y9-trig',         'name':'Trigonometry',        'subject':'Maths',   'year':9, 'desc':'SOH CAH TOA to find missing angles and sides in right triangles.'},
    {'id':'m-y9-equations',    'name':'Linear Equations',    'subject':'Maths',   'year':9, 'desc':'Solving multi-step equations and working with brackets.'},
    {'id':'m-y9-standard-form','name':'Standard Form',       'subject':'Maths',   'year':9, 'desc':'Writing very large and very small numbers using powers of 10.'},
    {'id':'m-y9-prob',         'name':'Advanced Probability','subject':'Maths',   'year':9, 'desc':'Using tree diagrams and calculating probability of independent events.'},
    {'id':'m-y9-indices',      'name':'Laws of Indices',     'subject':'Maths',   'year':9, 'desc':'Understanding rules for multiplying, dividing, and raising powers.'},
    # YEAR 9 SCIENCE
    {'id':'s-y9-atoms',   'name':'Atomic Structure',  'subject':'Science','year':9, 'desc':'Protons, neutrons, electrons, and the history of the atomic model.'},
    {'id':'s-y9-energy',  'name':'Energy & Efficiency','subject':'Science','year':9, 'desc':'Calculating work done, GPE, kinetic energy, and conservation.'},
    {'id':'s-y9-cells',   'name':'Cell Biology',       'subject':'Science','year':9, 'desc':'Comparing plant and animal cells, microscopes, and diffusion.'},
    {'id':'s-y9-bonding', 'name':'Chemical Bonding',   'subject':'Science','year':9, 'desc':'Introduction to ionic, covalent, and metallic bonding structures.'},
    {'id':'s-y9-periodic','name':'The Periodic Table', 'subject':'Science','year':9, 'desc':'Trends in Group 1, Group 7, and transition metal properties.'},
    # YEAR 10 MATHS
    {'id':'m-y10-quadratics', 'name':'Quadratic Equations','subject':'Maths',   'year':10, 'desc':'Factorising, using the quadratic formula, and completing the square.'},
    {'id':'m-y10-prob-trees', 'name':'Probability Trees',  'subject':'Maths',   'year':10, 'desc':'Modeling independent and dependent events with probability trees.'},
    {'id':'m-y10-circles',    'name':'Circle Theorems',    'subject':'Maths',   'year':10, 'desc':'The 8 geometric rules governing angles and lines within circles.'},
    {'id':'m-y10-vectors',    'name':'Vector Geometry',    'subject':'Maths',   'year':10, 'desc':'Adding, subtracting, and scaling vectors to solve geometric proofs.'},
    # YEAR 10 SCIENCE
    {'id':'s-y10-infection',   'name':'Infection & Response','subject':'Science','year':10, 'desc':'Communicable diseases, pathogens, vaccines, and the immune system.'},
    {'id':'s-y10-organic-chem','name':'Organic Chemistry',  'subject':'Science','year':10, 'desc':'Alkanes, alkenes, crude oil fractional distillation, and cracking.'},
    {'id':'s-y10-waves',       'name':'Waves & Radiation',  'subject':'Science','year':10, 'desc':'Properties of transverse and longitudinal waves; the EM spectrum.'},
    {'id':'s-y10-magnetism',   'name':'Magnetism',          'subject':'Science','year':10, 'desc':'Electromagnets, the motor effect, and Fleming\'s left-hand rule.'},
]

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler()
    ]
)
log = logging.getLogger('EduGenius')

# ── Gemini ────────────────────────────────────────────────────────────────────

def call_gemini(prompt, retries=3):
    import urllib.request, urllib.error
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}'
    body = json.dumps({'contents':[{'parts':[{'text':prompt}]}]}).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=body,
                headers={'Content-Type':'application/json'}, method='POST')
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.loads(r.read())
                return data['candidates'][0]['content']['parts'][0]['text']
        except urllib.error.HTTPError as e:
            body_err = e.read().decode()[:200]
            if e.code == 429:
                log.warning(f'Rate limited — waiting 30s ({body_err})')
                time.sleep(30)
            else:
                log.warning(f'HTTP {e.code}: {body_err}')
                time.sleep(3)
        except Exception as e:
            log.warning(f'Attempt {attempt+1} failed: {e}')
            time.sleep(3)
    return None

def parse_json(text, fallback=None):
    if not text: return fallback
    try:
        return json.loads(text.replace('```json','').replace('```','').strip())
    except:
        try:
            s,e = text.index('{'), text.rindex('}')
            return json.loads(text[s:e+1])
        except:
            return fallback

# ── Local Validation (no API call) ───────────────────────────────────────────

def validate_locally(q, subject):
    """
    Check question quality without any API call.
    Returns (is_valid, reason)
    """
    if not q: return False, 'Empty response'
    if not q.get('text') or len(q['text']) < 20:
        return False, 'Question too short'
    if not q.get('correctAnswer'):
        return False, 'No correct answer'
    if not q.get('explanation') or len(q['explanation']) < 15:
        return False, 'No explanation'

    # MCQ checks
    opts = q.get('options', [])
    if opts:
        if len(opts) < 3:
            return False, 'Too few options'
        if q['correctAnswer'] not in opts:
            return False, 'Correct answer not in options'
        if len(set(opts)) != len(opts):
            return False, 'Duplicate options'

    # Reject only specific diagram/image references — app has no images
    # Hard rejections — always invalid
    hard_forbidden = [
        'see diagram', 'see figure', 'in the figure', 'in the diagram',
        'the diagram shows', 'shown in the diagram', 'shown above',
        'shown below', 'as shown in', 'look at the diagram',
        'look at the figure', 'the image shows', 'in the image above',
        'in the image below', 'from the image'
    ]
    text_lower = q['text'].lower()
    for f in hard_forbidden:
        if f in text_lower:
            return False, f'References external visual: "{f}"'

    # Conditional rejections — only if paired with a visual noun
    visual_nouns = ['diagram', 'figure', 'image', 'picture',
                    'illustration', 'chart above', 'table above']
    conditional = ['refer to the', 'using the', 'from the graph']
    for phrase in conditional:
        if phrase in text_lower:
            for noun in visual_nouns:
                if noun in text_lower:
                    return False, f'References external visual: "{phrase} {noun}"'

    # Reject overly generic questions
    generic = ['what is x','find x','solve for x','calculate x']
    for g in generic:
        if q['text'].lower().strip() == g:
            return False, 'Too generic'

    # Science: explanation should be at least 2 sentences
    if subject == 'Science':
        if q['explanation'].count('.') < 1:
            return False, 'Science explanation too brief'

    return True, 'OK'

# ── Curriculum Generation ─────────────────────────────────────────────────────

def generate_curriculum(topic):
    prompt = f'''You are writing GCSE study content for UK Year {topic['year']} {topic['subject']} students.
Topic: {topic['name']}
Context: {topic['desc']}

Return ONLY this JSON — be specific to this topic, not generic:
{{
  "overview": "2-3 clear sentences explaining exactly what this topic covers and why it matters for GCSE",
  "concepts": [
    "specific step or concept 1 — concrete, not vague",
    "specific step or concept 2",
    "specific step or concept 3",
    "specific step or concept 4"
  ],
  "explanation": "clear paragraph with a worked example showing exactly how to apply this topic",
  "proTip": "one specific exam technique that gains marks in {topic['name']} questions",
  "flashcards": [
    {{"front": "specific question about {topic['name']}", "back": "specific correct answer"}},
    {{"front": "another specific question", "back": "specific answer"}},
    {{"front": "exam-style question", "back": "model answer"}},
    {{"front": "common misconception as a question", "back": "correct clarification"}},
    {{"front": "formula or key fact", "back": "definition or worked example"}}
  ],
  "keyFormulas": ["exact formula 1 with variable definitions", "exact formula 2"],
  "commonMistakes": [
    "specific mistake students make in {topic['name']} questions",
    "another specific mistake with explanation of what to do instead"
  ]
}}'''

    raw = call_gemini(prompt)
    result = parse_json(raw)
    if not result or not result.get('overview') or len(result.get('overview','')) < 50:
        log.warning(f'  Curriculum fallback used for {topic["name"]}')
        return None
    return result

# ── Question Generation ───────────────────────────────────────────────────────

DIFFICULTY_DESC = {
    'Beginner':     'Direct recall or single-step. Student applies one fact or formula straightforwardly.',
    'Intermediate': 'Two-step problem. Student selects which method to use and applies it correctly.',
    'Advanced':     'Multi-step or applied context. Student combines concepts or works in an unfamiliar setting.'
}

SUBJECT_RULES = {
    'Maths': (
        'RULES: No diagrams. Describe geometry in words e.g. "Triangle ABC with AB=5cm, angle B=90 degrees, BC=12cm". '
        'Give graph data as a table e.g. "Time(s): 0,2,4 | Distance(m): 0,10,20". '
        'Always include specific numbers to work with. '
        'For 2+ mark questions mention that working is required.'
    ),
    'Science': (
        'RULES: Use correct command words — '
        'State (1 mark, one word/phrase answer), '
        'Describe (2-3 marks, what happens), '
        'Explain (3-4 marks, must include cause AND effect linked by "because" or "so"), '
        'Calculate (show formula then substitution then answer with units). '
        'Use correct scientific terminology. '
        'Include units in all numerical answers.'
    )
}

def generate_question(topic, difficulty, existing_questions):
    """Generate one question, avoiding repeats."""

    avoid_block = ''
    if existing_questions:
        recent = existing_questions[-5:]  # avoid last 5
        avoid_block = '\nAVOID questions similar to:\n' + '\n'.join(
            f'- {q["text"][:80]}' for q in recent
        )

    prompt = f'''Generate a {difficulty} GCSE {topic['subject']} question on "{topic['name']}" for Year {topic['year']} students.

Topic context: {topic['desc']}
Difficulty: {difficulty} — {DIFFICULTY_DESC[difficulty]}
{SUBJECT_RULES[topic['subject']]}
{avoid_block}

Return ONLY this JSON:
{{
  "text": "complete self-contained question with all values — nothing external needed",
  "options": ["option A", "option B", "option C", "option D"],
  "correctAnswer": "must exactly match one of the options above",
  "explanation": "step by step working showing why this is correct",
  "hint": "specific clue about which method or formula to use without giving the answer"
}}
For open-ended questions: "options":[] and "correctAnswer":"full model answer with working shown".'''

    raw = call_gemini(prompt)
    if not raw: return None

    q = parse_json(raw)
    if not q: return None

    # Fix MCQ mismatch
    if q.get('options') and q['correctAnswer'] not in q['options']:
        q['correctAnswer'] = q['options'][0]
        log.warning(f'    Fixed correctAnswer mismatch for {topic["name"]}')

    return q

# ── Progress Tracking ─────────────────────────────────────────────────────────

def load_progress():
    """Load which topics are already done so we can resume after interruption."""
    progress_file = DATA_DIR / 'generation_progress.json'
    if progress_file.exists():
        try:
            text = progress_file.read_text(encoding='utf-8').strip()
            if text:
                return json.loads(text)
        except (json.JSONDecodeError, Exception) as e:
            print(f"Progress file corrupted ({e}) — starting fresh for missing topics")
    return {'curriculum': [], 'questions': {}}

def save_progress(progress):
    progress_file = DATA_DIR / 'generation_progress.json'
    progress_file.write_text(json.dumps(progress, indent=2), encoding='utf-8')

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    DATA_DIR.mkdir(exist_ok=True)
    Q_DIR.mkdir(exist_ok=True)

    log.info('=' * 60)
    log.info(f'EduGenius Static Content Generator')
    log.info(f'Started: {datetime.now().strftime("%Y-%m-%d %H:%M")}')
    log.info(f'Topics: {len(TOPICS)} | Questions per difficulty: {QUESTIONS_PER_DIFFICULTY}')
    log.info(f'Estimated time: ~45 minutes | Cost: ~$0.13')
    log.info('=' * 60)

    progress = load_progress()
    curriculum_data = {}

    # Load existing curriculum if file exists (for resume)
    curriculum_file = DATA_DIR / 'curriculum.json'
    if curriculum_file.exists():
        try:
            text = curriculum_file.read_text(encoding='utf-8').strip()
            curriculum_data = json.loads(text) if text else {}
        except (json.JSONDecodeError, Exception) as e:
            print(f"Curriculum file corrupted ({e}) — will regenerate missing topics")
            curriculum_data = {}

    total_topics = len(TOPICS)
    generated_questions = 0
    failed_questions = 0

    for i, topic in enumerate(TOPICS):
        log.info(f'\n[{i+1}/{total_topics}] {topic["name"]} (Year {topic["year"]} {topic["subject"]})')

        # ── CURRICULUM ──────────────────────────────────────────────────────
        if topic['id'] not in progress['curriculum']:
            time.sleep(API_DELAY)
            curriculum = generate_curriculum(topic)
            if curriculum:
                curriculum_data[topic['id']] = {
                    'topicId': topic['id'],
                    'name': topic['name'],
                    'subject': topic['subject'],
                    'year': topic['year'],
                    **curriculum
                }
                progress['curriculum'].append(topic['id'])
                # Save after each topic so we can resume
                curriculum_file.write_text(json.dumps(curriculum_data, indent=2, ensure_ascii=False), encoding='utf-8')
                save_progress(progress)
                log.info(f'  ✓ Curriculum generated')
            else:
                log.warning(f'  ✗ Curriculum failed — will use description as fallback')
        else:
            log.info(f'  ✓ Curriculum already done — skipping')

        # ── QUESTIONS ───────────────────────────────────────────────────────
        q_file = Q_DIR / f'{topic["id"]}.json'
        if q_file.exists():
            try:
                text = q_file.read_text(encoding='utf-8').strip()
                existing_bank = json.loads(text) if text else {}
            except (json.JSONDecodeError, Exception) as e:
                print(f"  Question file corrupted ({e}) — regenerating")
                existing_bank = {}
        else:
            existing_bank = {}

        bank_updated = False

        for difficulty in DIFFICULTIES:
            existing = existing_bank.get(difficulty, [])
            already_done = len(existing)

            if already_done >= QUESTIONS_PER_DIFFICULTY:
                log.info(f'  {difficulty}: already has {already_done} questions — skipping')
                continue

            needed = QUESTIONS_PER_DIFFICULTY - already_done
            log.info(f'  {difficulty}: generating {needed} questions (have {already_done})')

            new_questions = []
            attempts = 0

            while len(new_questions) < needed and attempts < needed * 2:
                attempts += 1
                time.sleep(API_DELAY)

                q = generate_question(topic, difficulty, existing + new_questions)
                if not q:
                    log.warning(f'    Generation failed attempt {attempts}')
                    failed_questions += 1
                    continue

                is_valid, reason = validate_locally(q, topic['subject'])
                if not is_valid:
                    log.warning(f'    Rejected: {reason}')
                    failed_questions += 1
                    continue

                q_record = {
                    'id': f'{topic["id"]}_{difficulty.lower()}_{len(existing)+len(new_questions)+1:03d}',
                    'topicId': topic['id'],
                    'subject': topic['subject'],
                    'difficulty': difficulty,
                    'yearLevel': topic['year'],
                    'text': q['text'],
                    'options': q.get('options', []),
                    'correctAnswer': q['correctAnswer'],
                    'explanation': q['explanation'],
                    'hint': q.get('hint', ''),
                    'generatedAt': datetime.now().isoformat()
                }

                new_questions.append(q_record)
                generated_questions += 1
                log.info(f'    Q{len(existing)+len(new_questions)}: ✓ {q["text"][:60]}...')

            existing_bank[difficulty] = existing + new_questions
            bank_updated = True

        if bank_updated:
            q_file.write_text(json.dumps(existing_bank, indent=2, ensure_ascii=False), encoding='utf-8')
            progress['questions'][topic['id']] = {d: len(existing_bank.get(d,[])) for d in DIFFICULTIES}
            save_progress(progress)

    # ── Final Summary ────────────────────────────────────────────────────────
    log.info('\n' + '=' * 60)
    log.info('GENERATION COMPLETE')
    log.info(f'  Topics processed:    {total_topics}')
    log.info(f'  Questions generated: {generated_questions}')
    log.info(f'  Questions rejected:  {failed_questions}')
    log.info(f'  Files written to:    {DATA_DIR}')
    log.info(f'  Completed:           {datetime.now().strftime("%Y-%m-%d %H:%M")}')
    log.info('=' * 60)
    log.info('\nNEXT STEPS:')
    log.info('1. Commit the data/ folder to your repo')
    log.info('2. Copy static_question_server.py to your project')
    log.info('3. Add the /api/question/static route to server.py')
    log.info('4. Update LearningArena fetchQuestion to call /api/question/static first')

if __name__ == '__main__':
    main()
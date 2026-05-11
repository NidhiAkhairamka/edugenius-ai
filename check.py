
import sqlite3
conn = sqlite3.connect('edugenius.db')
conn.execute("DELETE FROM briefing_vault WHERE studentName='DemoGenius'")
conn.execute("DELETE FROM topic_synthesis WHERE studentName='DemoGenius'")
conn.commit()
print('Cleared phantom notes')
conn.close()
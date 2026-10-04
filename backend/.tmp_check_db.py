import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect('postgresql://postgres:26042002@localhost:5432/Kodeistry')
cur = conn.cursor(cursor_factory=RealDictCursor)
cur.execute("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename")
print('tables=', [r['tablename'] for r in cur.fetchall()])
cur.execute("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position")
print('users columns=')
for row in cur.fetchall():
    print(row)
cur.execute("SELECT * FROM alembic_version")
print('alembic_version=', cur.fetchall())
conn.close()

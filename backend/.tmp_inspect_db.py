import psycopg2

url = 'postgresql://postgres:26042002@localhost:5432/Kodeistry'
with psycopg2.connect(url) as conn:
    with conn.cursor() as cur:
        cur.execute('SELECT current_database(), current_schema(), current_user')
        print('db info:', cur.fetchone())
        cur.execute("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename")
        print('tables:', cur.fetchall())
        cur.execute("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position")
        print('users columns:', cur.fetchall())
        cur.execute("SELECT to_regclass('public.alembic_version')")
        print('alembic_version exists:', cur.fetchone())
        try:
            cur.execute('SELECT * FROM alembic_version')
            print('alembic_version rows:', cur.fetchall())
        except Exception as e:
            print('alembic_version error:', e)

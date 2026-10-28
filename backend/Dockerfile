FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && groupadd --gid 1000 rendersecrets \
    && useradd --system --create-home --uid 10001 --groups rendersecrets kodeistry
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY templates ./templates
USER kodeistry
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','10000')+'/health',timeout=3)" || exit 1
CMD ["python", "-m", "app.server"]

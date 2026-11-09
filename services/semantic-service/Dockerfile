FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY download_model.py .
RUN python download_model.py
COPY app.py dialogue.py grounding.py intents.json ./
COPY test_semantics.py test_grounding.py evaluate.py evaluation.json acceptance.json ./
RUN useradd --system --uid 10001 assistant
USER assistant
ENV MODEL_DIR=/models/e5 PORT=8091 TOKENIZERS_PARALLELISM=false
EXPOSE 8091
HEALTHCHECK --interval=15s --timeout=3s --start-period=45s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8091/health')"
CMD ["python", "-u", "app.py"]

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY backend /app/backend
COPY data /app/data
RUN useradd --create-home sentinel && chown -R sentinel:sentinel /app
USER sentinel
ENV AI_PROVIDER=mock DATABASE_URL=sqlite:////app/data/sentinel.db
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "8000"]

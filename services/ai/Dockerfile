FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Injected at runtime (compose / -e). Empty here so the image builds without
# a secret; when unset the CV endpoint returns a labelled mock response.
# GEMINI_MODEL is optional (defaults to gemini-flash-lite-latest).
ENV GEMINI_API_KEY=""
ENV GEMINI_MODEL="gemini-flash-lite-latest"

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
